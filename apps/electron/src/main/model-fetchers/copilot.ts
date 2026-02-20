/**
 * Copilot Model Fetcher
 *
 * Fetches available models from the GitHub Copilot SDK via listModels().
 * Part of the centralized ModelRefreshService model discovery system.
 */

import { app } from 'electron'
import { existsSync } from 'node:fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { ModelFetcher, ModelFetchResult, ModelFetcherCredentials } from '@craft-agent/shared/config'
import type { LlmConnection, ModelDefinition } from '@craft-agent/shared/config'
import { ipcLog } from '../logger'

const COPILOT_TIMEOUT_MS = 30_000

export class CopilotModelFetcher implements ModelFetcher {
  /** No periodic refresh — fetch on auth only */
  readonly refreshIntervalMs = 0

  async fetchModels(
    connection: LlmConnection,
    credentials: ModelFetcherCredentials,
  ): Promise<ModelFetchResult> {
    const accessToken = credentials.oauthAccessToken
    if (!accessToken) {
      throw new Error('GitHub access token required to fetch Copilot models')
    }

    const { CopilotClient } = await import('@github/copilot-sdk')

    // Resolve @github/copilot CLI path
    const basePath = app.isPackaged ? app.getAppPath() : process.cwd()
    const platform = process.platform === 'win32' ? 'win32' : process.platform === 'linux' ? 'linux' : 'darwin'
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const binaryName = platform === 'win32' ? 'copilot.exe' : 'copilot'

    const copilotCliPath = app.isPackaged
      ? join(basePath, 'vendor', 'copilot', `${platform}-${arch}`, binaryName)
      : join(basePath, 'node_modules', '@github', `copilot-${platform}-${arch}`, binaryName)

    const debugLines: string[] = []
    const debugLog = (msg: string) => {
      const line = `[${new Date().toISOString()}] ${msg}`
      debugLines.push(line)
      ipcLog.info(msg)
    }

    debugLog(`Copilot CLI path: ${copilotCliPath} (exists: ${existsSync(copilotCliPath)})`)
    debugLog(`Access token: ${accessToken.substring(0, 8)}...${accessToken.substring(accessToken.length - 4)}`)

    // Pass token via COPILOT_GITHUB_TOKEN env var
    const prevToken = process.env.COPILOT_GITHUB_TOKEN
    process.env.COPILOT_GITHUB_TOKEN = accessToken

    const client = new CopilotClient({
      useStdio: true,
      autoStart: true,
      logLevel: 'debug',
      ...(existsSync(copilotCliPath) ? { cliPath: copilotCliPath } : {}),
    })

    const writeDebugFile = async () => {
      try {
        const debugPath = join(homedir(), '.craft-agent', 'copilot-debug.log')
        await writeFile(debugPath, debugLines.join('\n') + '\n', 'utf-8')
      } catch { /* ignore */ }
    }

    const restoreEnv = () => {
      if (prevToken !== undefined) {
        process.env.COPILOT_GITHUB_TOKEN = prevToken
      } else {
        delete process.env.COPILOT_GITHUB_TOKEN
      }
    }

    let models: Array<{ id: string; name: string; supportedReasoningEfforts?: string[] }>
    try {
      debugLog('Starting Copilot client...')
      await Promise.race([
        client.start(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(
          'Copilot client failed to start within 30 seconds. Check your network connection and GitHub Copilot subscription.',
        )), COPILOT_TIMEOUT_MS)),
      ])
      debugLog('Copilot client started, fetching models...')
      models = await Promise.race([
        client.listModels(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(
          'Copilot model listing timed out after 30 seconds. Your GitHub token may be invalid or your Copilot plan may not support this feature.',
        )), COPILOT_TIMEOUT_MS)),
      ])
      debugLog(`listModels returned ${models?.length ?? 0} models: ${models?.map(m => m.id).join(', ')}`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack : undefined
      debugLog(`Copilot listModels FAILED: ${msg}`)
      if (stack) debugLog(`Stack: ${stack}`)
      await writeDebugFile()
      restoreEnv()
      try { await client.stop() } catch { /* ignore cleanup errors */ }
      throw error
    }
    await client.stop()
    restoreEnv()
    await writeDebugFile()

    if (!models || models.length === 0) {
      throw new Error('No models returned from Copilot API. Your Copilot plan may not support this feature.')
    }

    const modelDefs: ModelDefinition[] = models.map(m => ({
      id: m.id,
      name: m.name,
      shortName: m.name,
      description: '',
      provider: 'copilot' as const,
      contextWindow: 200_000,
      supportsThinking: !!(m.supportedReasoningEfforts && m.supportedReasoningEfforts.length > 0),
    }))

    ipcLog.info(`Fetched ${modelDefs.length} Copilot models: ${modelDefs.map(m => m.id).join(', ')}`)

    return { models: modelDefs }
  }
}
