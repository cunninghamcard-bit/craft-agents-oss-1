/**
 * Anthropic Model Fetcher
 *
 * Fetches available models from the Anthropic /v1/models API.
 * Filters to claude-* models only and maps to ModelDefinition format.
 * Used by the 'anthropic' provider type (bedrock/vertex use a separate stub fetcher).
 */

import type { ModelFetcher, ModelFetchResult, ModelFetcherCredentials } from '@craft-agent/shared/config'
import type { LlmConnection, ModelDefinition } from '@craft-agent/shared/config'
import { ipcLog } from '../logger'

/** Response shape from GET /v1/models */
interface AnthropicModelsResponse {
  data: Array<{
    id: string
    display_name: string
    created_at: string
    type: string
  }>
  has_more: boolean
  first_id: string
  last_id: string
}

/**
 * Derive a short display name from the model ID.
 * "claude-opus-4-6" → "Opus"
 * "claude-sonnet-4-5-20250929" → "Sonnet"
 * "claude-haiku-4-5-20251001" → "Haiku"
 * "claude-3-opus-20240229" → "Opus"
 * "claude-3-5-sonnet-20241022" → "Sonnet"
 */
function deriveShortName(modelId: string): string {
  const stripped = modelId
    .replace('claude-', '')
    .replace(/-\d{8}$/, '')  // Remove date suffix
    .replace(/-latest$/, '') // Remove -latest suffix

  // Extract variant name: "3-5-sonnet" → "sonnet", "opus-4-6" → "opus"
  const variant = stripped
    .replace(/^[\d.-]+/, '')   // Strip leading version: "3-5-sonnet" → "sonnet"
    .replace(/-[\d.]+$/, '')   // Strip trailing version: "opus-4-6" → "opus"
    .replace(/^-/, '')
  if (variant) {
    return variant.charAt(0).toUpperCase() + variant.slice(1)
  }

  // No variant (e.g. "4") — use the version
  return stripped
}

/**
 * Filter: only keep models that are useful for coding agent use.
 * Skip legacy models (claude-2, claude-instant) and non-chat models.
 */
function isRelevantModel(id: string): boolean {
  // Must be a claude model
  if (!id.startsWith('claude-')) return false
  // Skip legacy families
  if (id.startsWith('claude-2') || id.startsWith('claude-instant') || id.startsWith('claude-1')) return false
  // Skip -latest aliases when we have the full versioned ID
  // (we keep both — the dropdown will show versioned ones)
  return true
}

export class AnthropicModelFetcher implements ModelFetcher {
  /** Refresh every 60 minutes */
  readonly refreshIntervalMs = 60 * 60 * 1000

  async fetchModels(
    connection: LlmConnection,
    credentials: ModelFetcherCredentials,
  ): Promise<ModelFetchResult> {
    const apiKey = credentials.apiKey
    if (!apiKey) {
      throw new Error('Anthropic API key required to fetch models')
    }

    const baseUrl = connection.baseUrl || 'https://api.anthropic.com'
    const headers = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }

    // Paginated fetch — collect all models across pages
    const allRawModels: AnthropicModelsResponse['data'] = []
    let afterId: string | undefined

    do {
      const params = new URLSearchParams({ limit: '100' })
      if (afterId) params.set('after_id', afterId)

      const response = await fetch(`${baseUrl}/v1/models?${params}`, { headers })

      if (!response.ok) {
        throw new Error(`Anthropic /v1/models failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as AnthropicModelsResponse
      if (data.data) allRawModels.push(...data.data)

      if (data.has_more && data.last_id) {
        afterId = data.last_id
      } else {
        break
      }
    } while (true)

    if (allRawModels.length === 0) {
      throw new Error('No models returned from Anthropic API')
    }

    const models: ModelDefinition[] = allRawModels
      .filter(m => isRelevantModel(m.id))
      .map(m => ({
        id: m.id,
        name: m.display_name,
        shortName: deriveShortName(m.id),
        description: '',
        provider: 'anthropic' as const,
        contextWindow: 200_000, // Anthropic API doesn't expose this; use known default
      }))

    ipcLog.info(`Fetched ${models.length} Anthropic models: ${models.map(m => m.id).join(', ')}`)

    return { models }
  }
}
