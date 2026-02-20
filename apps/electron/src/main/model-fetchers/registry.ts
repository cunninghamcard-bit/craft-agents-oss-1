/**
 * Model Fetcher Registry
 *
 * Type-safe map from FetchableProvider → ModelFetcher.
 * TypeScript enforces that every FetchableProvider key is present.
 * Adding a new LlmProviderType without registering a fetcher → compile error.
 */

import type { ModelFetcherMap } from '@craft-agent/shared/config'
import { AnthropicModelFetcher } from './anthropic'
import { CodexModelFetcher } from './codex'
import { CopilotModelFetcher } from './copilot'
import { PiModelFetcher } from './pi'
import { BedrockVertexModelFetcher } from './bedrock-vertex'

// Shared instances — fetchers are stateless
const anthropicFetcher = new AnthropicModelFetcher()
const codexFetcher = new CodexModelFetcher()
const copilotFetcher = new CopilotModelFetcher()
const piFetcher = new PiModelFetcher()
const bedrockVertexFetcher = new BedrockVertexModelFetcher()

/**
 * Every FetchableProvider MUST have a fetcher entry.
 * If you add a new LlmProviderType (e.g., 'gemini') and don't exclude it
 * from FetchableProvider, this object will fail to compile until you add it here.
 */
export const MODEL_FETCHERS: ModelFetcherMap = {
  anthropic: anthropicFetcher,
  openai:    codexFetcher,
  copilot:   copilotFetcher,
  pi:        piFetcher,
  bedrock:   bedrockVertexFetcher,
  vertex:    bedrockVertexFetcher,
}
