/**
 * Bedrock/Vertex Model Fetcher (stub)
 *
 * Bedrock and Vertex use AWS IAM / GCP service account auth respectively,
 * which are incompatible with the Anthropic /v1/models API.
 * Models are provided via Cloudflare fallback (Layer 2) or MODEL_REGISTRY (Layer 4).
 *
 * This stub exists to satisfy the ModelFetcherMap type constraint without
 * causing periodic log spam from always-failing API calls.
 */

import type { ModelFetcher, ModelFetchResult, ModelFetcherCredentials } from '@craft-agent/shared/config'
import type { LlmConnection } from '@craft-agent/shared/config'

export class BedrockVertexModelFetcher implements ModelFetcher {
  /** No periodic refresh — models come from Cloudflare/registry only */
  readonly refreshIntervalMs = 0

  async fetchModels(
    _connection: LlmConnection,
    _credentials: ModelFetcherCredentials,
  ): Promise<ModelFetchResult> {
    throw new Error('Bedrock/Vertex model discovery not available — using fallback chain')
  }
}
