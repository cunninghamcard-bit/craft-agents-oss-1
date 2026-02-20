/**
 * Pi Model Fetcher
 *
 * Uses the Pi SDK's built-in model registry (getModels) to discover available models.
 * No network call needed — models are compiled into the SDK and update when it's bumped.
 */

import type { ModelFetcher, ModelFetchResult, ModelFetcherCredentials } from '@craft-agent/shared/config'
import type { LlmConnection } from '@craft-agent/shared/config'
import { getPiModelsForAuthProvider, getAllPiModels } from '@craft-agent/shared/config'

export class PiModelFetcher implements ModelFetcher {
  /** No periodic refresh — SDK models are static, updated on app upgrade */
  readonly refreshIntervalMs = 0

  async fetchModels(
    connection: LlmConnection,
    _credentials: ModelFetcherCredentials,
  ): Promise<ModelFetchResult> {
    const models = connection.piAuthProvider
      ? getPiModelsForAuthProvider(connection.piAuthProvider)
      : getAllPiModels()

    if (models.length === 0) {
      throw new Error(
        `No Pi models found for provider: ${connection.piAuthProvider ?? 'all'}`,
      )
    }

    return { models }
  }
}
