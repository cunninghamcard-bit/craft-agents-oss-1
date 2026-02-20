/**
 * Cloudflare Fallback Fetcher
 *
 * Fetches model lists from a static JSON hosted on Cloudflare Workers.
 * Used as layer 2 in the fallback chain when the provider's primary API fails.
 *
 * Endpoint: models.craft.do/v1/{providerKey}.json
 * Response: { models: ModelDefinition[], updated: string }
 */

import type { ModelFetchResult } from '@craft-agent/shared/config'
import type { ModelDefinition } from '@craft-agent/shared/config'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'path'
import { homedir } from 'os'
import { ipcLog } from '../logger'

const CLOUDFLARE_BASE_URL = 'https://models.craft.do/v1'
const FETCH_TIMEOUT_MS = 10_000
const CACHE_DIR = join(homedir(), '.craft-agent', 'model-cache')

interface CloudflareModelsResponse {
  models: ModelDefinition[]
  updated: string
}

/**
 * Read cached model data from disk.
 */
function readCache(providerKey: string): ModelDefinition[] | null {
  try {
    const cachePath = join(CACHE_DIR, `${providerKey}.json`)
    if (!existsSync(cachePath)) return null
    const data = JSON.parse(readFileSync(cachePath, 'utf-8')) as CloudflareModelsResponse
    return data.models
  } catch {
    return null
  }
}

/**
 * Write model data to disk cache.
 */
function writeCache(providerKey: string, data: CloudflareModelsResponse): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(join(CACHE_DIR, `${providerKey}.json`), JSON.stringify(data), 'utf-8')
  } catch {
    // Cache write failure is non-fatal
  }
}

/**
 * Fetch models from Cloudflare for a specific provider key.
 * Returns null if the endpoint is not available or fails.
 */
export async function fetchFromCloudflare(providerKey: string): Promise<ModelFetchResult | null> {
  const url = `${CLOUDFLARE_BASE_URL}/${providerKey}.json`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!response.ok) {
      ipcLog.info(`Cloudflare models fetch for ${providerKey}: ${response.status}`)
      // Fall through to cache
      const cached = readCache(providerKey)
      if (cached) return { models: cached }
      return null
    }

    const data = await response.json() as CloudflareModelsResponse

    if (!data.models || data.models.length === 0) {
      return null
    }

    // Update disk cache
    writeCache(providerKey, data)

    ipcLog.info(`Fetched ${data.models.length} models from Cloudflare for ${providerKey}`)
    return { models: data.models }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    ipcLog.info(`Cloudflare models fetch failed for ${providerKey}: ${msg}`)

    // Try disk cache
    const cached = readCache(providerKey)
    if (cached) {
      ipcLog.info(`Using cached models for ${providerKey} (${cached.length} models)`)
      return { models: cached }
    }

    return null
  }
}
