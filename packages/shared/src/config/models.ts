/**
 * Centralized Model Registry
 *
 * Single source of truth for all model definitions across the application.
 * All model metadata, capabilities, and costs are defined here.
 *
 * When adding a new model or provider:
 * 1. Add the model(s) to MODEL_REGISTRY
 * 2. The convenience exports (ANTHROPIC_MODELS, OPENAI_MODELS) auto-update
 * 3. Update llm-connections.ts if adding a new built-in connection
 */

import { getProviders, getModels } from '@mariozechner/pi-ai';
import type { KnownProvider, Model, Api } from '@mariozechner/pi-ai';

// ============================================
// TYPES
// ============================================

/**
 * Provider identifier for AI backends.
 */
export type ModelProvider = 'anthropic' | 'openai' | 'copilot' | 'pi';

/**
 * Full model definition with capabilities and costs.
 * Used throughout the application for model selection and display.
 */
export interface ModelDefinition {
  /** Model identifier (e.g., 'claude-sonnet-4-5-20250929', 'gpt-5.3-codex') */
  id: string;
  /** Human-readable name (e.g., 'Sonnet 4.5', 'Codex') */
  name: string;
  /** Short display name for compact UI (e.g., 'Sonnet', 'Codex') */
  shortName: string;
  /** Brief description of the model's strengths */
  description: string;
  /** Provider that offers this model */
  provider: ModelProvider;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Whether this model supports thinking/reasoning effort. Defaults to true when undefined. */
  supportsThinking?: boolean;
}

// ============================================
// MODEL REGISTRY (Single Source of Truth)
// ============================================

/**
 * All available models across all providers.
 * This is the authoritative list - all other model arrays derive from this.
 */
export const MODEL_REGISTRY: ModelDefinition[] = [
  // ----------------------------------------
  // Anthropic Claude Models
  // ----------------------------------------
  {
    id: 'claude-opus-4-6',
    name: 'Opus 4.6',
    shortName: 'Opus',
    description: 'Most capable for complex work',
    provider: 'anthropic',
    contextWindow: 200_000,
  },
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Opus 4.5',
    shortName: 'Opus 4.5',
    description: 'Previous generation flagship model',
    provider: 'anthropic',
    contextWindow: 200_000,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Sonnet 4.5',
    shortName: 'Sonnet',
    description: 'Best for everyday tasks',
    provider: 'anthropic',
    contextWindow: 200_000,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Haiku 4.5',
    shortName: 'Haiku',
    description: 'Fastest for quick answers',
    provider: 'anthropic',
    contextWindow: 200_000,
  },

  // ----------------------------------------
  // OpenAI Codex Models — FALLBACK entries only.
  // At runtime, models are discovered dynamically via model/list from the Codex app-server.
  // See ModelRefreshService in apps/electron/src/main/model-fetchers/.
  // These entries are used as layer 4 (last resort) when:
  //   - App-server is not running (e.g., first launch before auth)
  //   - model/list call fails (network, timeout)
  //   - Cloudflare JSON also unavailable
  // ----------------------------------------
  {
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    shortName: 'Codex',
    description: 'OpenAI reasoning model',
    provider: 'openai',
    contextWindow: 256_000,
  },
  {
    id: 'gpt-5.1-codex-mini',
    name: 'GPT-5.1 Codex Mini',
    shortName: 'Codex Mini',
    description: 'Fast OpenAI model',
    provider: 'openai',
    contextWindow: 128_000,
  },

  // ----------------------------------------
  // GitHub Copilot & Pi Models
  // No hardcoded entries — models are discovered dynamically:
  //   - Copilot: client.listModels() via Copilot SDK
  //   - Pi: getModels(provider) from @mariozechner/pi-ai SDK
  // See ModelRefreshService in apps/electron/src/main/model-fetchers/
  // ----------------------------------------
];

// ============================================
// PROVIDER-FILTERED EXPORTS
// ============================================

/**
 * Get models filtered by provider.
 */
export function getModelsByProvider(provider: ModelProvider): ModelDefinition[] {
  return MODEL_REGISTRY.filter(m => m.provider === provider);
}

/** All Anthropic Claude models */
export const ANTHROPIC_MODELS = getModelsByProvider('anthropic');

/** All OpenAI/Codex models */
export const OPENAI_MODELS = getModelsByProvider('openai');


// ============================================
// PI MODEL DISCOVERY (from SDK)
// ============================================

/**
 * Convert a Pi SDK Model to our ModelDefinition format.
 */
function piModelToDefinition(m: Model<Api>): ModelDefinition {
  // Derive a short display name: "Claude 4.5 Sonnet" → "Sonnet (Pi)"
  // Just use the name as-is with " (Pi)" suffix for shortName
  const lastPart = m.name.split(/[\s-]/).pop() ?? m.name;
  const shortName = m.name.length > 20
    ? lastPart + ' (Pi)'
    : m.name + ' (Pi)';

  return {
    id: `pi/${m.id}`,
    name: `${m.name} (Pi)`,
    shortName,
    description: `${m.provider} model via Pi unified API`,
    provider: 'pi',
    contextWindow: m.contextWindow,
    supportsThinking: m.reasoning,
  };
}

/**
 * Get Pi models for a specific auth provider directly from the Pi SDK.
 * The SDK's getModels() already filters by provider — no manual prefix matching needed.
 *
 * @param piAuthProvider - The Pi auth provider name (e.g., 'anthropic', 'openai', 'google')
 * @returns Pi models for that provider, mapped to ModelDefinition format
 */
export function getPiModelsForAuthProvider(piAuthProvider: string): ModelDefinition[] {
  try {
    const models = getModels(piAuthProvider as KnownProvider);
    if (models.length > 0) {
      return models.map(piModelToDefinition);
    }
  } catch {
    // Provider not recognized by SDK — fall through
  }
  return [];
}

/**
 * Get all Pi models across all providers from the SDK.
 * Used as fallback when no specific piAuthProvider is set.
 *
 * @returns All Pi models from all known providers
 */
export function getAllPiModels(): ModelDefinition[] {
  const allModels: ModelDefinition[] = [];
  for (const provider of getProviders()) {
    try {
      const models = getModels(provider);
      allModels.push(...models.map(piModelToDefinition));
    } catch {
      // Skip providers that fail
    }
  }
  return allModels;
}

// ============================================
// PI PROVIDER DISCOVERY (from SDK)
// ============================================

/**
 * Display metadata for Pi SDK providers.
 * Providers not in this map use a derived display name (e.g., 'xai' → 'Xai').
 */
const PI_PROVIDER_DISPLAY: Partial<Record<KnownProvider, { label: string; placeholder: string }>> = {
  'anthropic':              { label: 'Anthropic',          placeholder: 'sk-ant-...' },
  'google':                 { label: 'Google AI Studio',   placeholder: 'AIza...' },
  'openai':                 { label: 'OpenAI',             placeholder: 'sk-...' },
  'openrouter':             { label: 'OpenRouter',         placeholder: 'sk-or-...' },
  'groq':                   { label: 'Groq',               placeholder: 'gsk_...' },
  'mistral':                { label: 'Mistral',            placeholder: 'sk-...' },
  'xai':                    { label: 'xAI (Grok)',         placeholder: 'xai-...' },
  'cerebras':               { label: 'Cerebras',           placeholder: 'csk-...' },
  'amazon-bedrock':         { label: 'Amazon Bedrock',     placeholder: 'AKIA...' },
  'azure-openai-responses': { label: 'Azure OpenAI',       placeholder: 'sk-...' },
  'vercel-ai-gateway':      { label: 'Vercel AI Gateway',  placeholder: 'sk-...' },
  'huggingface':            { label: 'Hugging Face',       placeholder: 'hf_...' },
};

/**
 * Providers to EXCLUDE from the Pi API key dropdown.
 * These use OAuth, device flows, or other non-API-key auth.
 */
const PI_EXCLUDED_PROVIDERS: Set<string> = new Set([
  'github-copilot',      // Uses OAuth device flow (separate onboarding card)
  'openai-codex',        // Uses ChatGPT OAuth (separate onboarding card)
  'google-vertex',       // Requires service account / gcloud auth
  'google-gemini-cli',   // Internal Google CLI variant
  'google-antigravity',  // Internal Google variant
]);

/** Info for a Pi provider available in the API key flow. */
export interface PiProviderInfo {
  key: string;
  label: string;
  placeholder: string;
}

/** Convert 'vercel-ai-gateway' → 'Vercel Ai Gateway' etc. */
function formatProviderName(key: string): string {
  return key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Get all Pi providers available for API key authentication.
 * Dynamically loaded from the Pi SDK — updates automatically when SDK adds providers.
 */
export function getPiApiKeyProviders(): PiProviderInfo[] {
  return getProviders()
    .filter(p => !PI_EXCLUDED_PROVIDERS.has(p))
    .map(p => {
      const display = PI_PROVIDER_DISPLAY[p];
      return {
        key: p,
        label: display?.label ?? formatProviderName(p),
        placeholder: display?.placeholder ?? 'sk-...',
      };
    })
    .sort((a, b) => {
      // Pin the big 3 at top, rest alphabetical
      const priority = ['anthropic', 'google', 'openai'];
      const ai = priority.indexOf(a.key);
      const bi = priority.indexOf(b.key);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.label.localeCompare(b.label);
    });
}

/**
 * Legacy compatibility export.
 * Used by existing code that imports MODELS (expects Claude models only).
 * @deprecated Use ANTHROPIC_MODELS or MODEL_REGISTRY instead
 */
export const MODELS = ANTHROPIC_MODELS;

// ============================================
// MODEL ID HELPERS (Derived from Registry)
// ============================================

/** Get the first model ID matching a short name, or undefined if not found */
function findModelIdByShortName(shortName: string): string | undefined {
  return MODEL_REGISTRY.find(m => m.shortName === shortName)?.id;
}

/** Get the first model ID matching a short name (throws if not found) */
export function getModelIdByShortName(shortName: string): string {
  const id = findModelIdByShortName(shortName);
  if (!id) throw new Error(`Model not found: ${shortName}`);
  return id;
}

// ============================================
// CONNECTION DEFAULTS
// Used ONLY when writing defaults to LLM connection config (not as runtime fallbacks).
// ============================================

/** Default model for Anthropic connections (used when creating/backfilling connections) */
export const DEFAULT_MODEL = getModelIdByShortName('Opus');

/** Default model for Codex/OpenAI connections (used when creating/backfilling connections) */
export const DEFAULT_CODEX_MODEL = getModelIdByShortName('Codex');


// ============================================
// UTILITY MODELS
// ============================================

/**
 * Get the default summarization model ID (Haiku).
 * Used as fallback when no connection context is available
 * (e.g., url-validator, mcp/validation, summarize.ts without modelOverride).
 *
 * For connection-aware summarization model resolution, use
 * getSummarizationModel(connection) from llm-connections.ts instead.
 */
export function getDefaultSummarizationModel(): string {
  return findModelIdByShortName('Haiku') ?? DEFAULT_MODEL;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get a model by ID from the registry.
 */
export function getModelById(modelId: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find(m => m.id === modelId);
}

/**
 * Get display name for a model ID (full name with version).
 */
export function getModelDisplayName(modelId: string): string {
  const model = getModelById(modelId);
  if (model) return model.name;
  // Fallback: strip prefix and date suffix, format nicely
  // e.g., "claude-opus-4-5-20251101" → "Opus 4.5"
  const stripped = modelId
    .replace('claude-', '')
    .replace(/-\d{8}$/, '');  // Remove date suffix
  // Split on dashes, capitalize first part, join version parts with dots
  const parts = stripped.split('-');
  const first = parts[0];
  if (!first) return modelId;
  const name = first.charAt(0).toUpperCase() + first.slice(1);
  const version = parts.slice(1).join('.');
  return version ? `${name} ${version}` : name;
}

/**
 * Get short display name for a model ID (without version number).
 */
export function getModelShortName(modelId: string): string {
  const model = getModelById(modelId);
  if (model) return model.shortName;
  // For provider-prefixed IDs (e.g. "openai/gpt-5"), show just the model part
  if (modelId.includes('/')) {
    return modelId.split('/').pop() || modelId;
  }
  // Fallback: strip claude- prefix and date suffix, then capitalize
  const stripped = modelId.replace('claude-', '').replace(/-[\d.-]+$/, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/**
 * Get known context window size for a model ID.
 */
export function getModelContextWindow(modelId: string): number | undefined {
  return getModelById(modelId)?.contextWindow;
}

/**
 * Check if model is an Opus model (for cache TTL decisions).
 */
export function isOpusModel(modelId: string): boolean {
  return modelId.includes('opus');
}

/**
 * Check if a model ID refers to a Claude model.
 * Handles both direct Anthropic IDs (e.g. "claude-sonnet-4-5-20250929")
 * and provider-prefixed IDs (e.g. "anthropic/claude-sonnet-4" via OpenRouter).
 */
export function isClaudeModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.startsWith('claude-') || lower.includes('/claude');
}

/**
 * Check if a model ID refers to a Codex/OpenAI model.
 * Checks MODEL_REGISTRY first, then optionally searches provided models
 * (e.g. dynamically-fetched connection models not in the registry).
 * Falls back to legacy string pattern for models not yet in registry.
 */
export function isCodexModel(modelId: string, connectionModels?: ModelDefinition[]): boolean {
  const model = getModelById(modelId);
  if (model) return model.provider === 'openai';
  // Dynamic models aren't in MODEL_REGISTRY — check connection models if provided
  if (connectionModels) {
    return connectionModels.some(m => m.id === modelId && m.provider === 'openai');
  }
  // Fallback: legacy string pattern
  return modelId.toLowerCase().includes('codex');
}

/**
 * Check if a model ID refers to a Copilot model.
 * Checks MODEL_REGISTRY first, then optionally searches provided models
 * (e.g. dynamically-fetched connection models not in the registry).
 */
export function isCopilotModel(modelId: string, connectionModels?: ModelDefinition[]): boolean {
  const model = getModelById(modelId);
  if (model) return model.provider === 'copilot';
  // Dynamic models aren't in MODEL_REGISTRY — check connection models if provided
  if (connectionModels) {
    return connectionModels.some(m => m.id === modelId && m.provider === 'copilot');
  }
  return false;
}


/**
 * Get the provider for a model ID.
 */
export function getModelProvider(modelId: string): ModelProvider | undefined {
  return getModelById(modelId)?.provider;
}

