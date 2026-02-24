/**
 * ApiKeyInput - Reusable API key entry form control
 *
 * Renders a password input for the API key, a preset selector for Base URL,
 * and an optional Model override field.
 *
 * Does NOT include layout wrappers or action buttons — the parent
 * controls placement via the form ID ("api-key-form") for submit binding.
 *
 * Used in: Onboarding CredentialsStep, Settings API dialog
 */

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from "@/components/ui/styled-dropdown"
import { cn } from "@/lib/utils"
import { Check, ChevronDown, Eye, EyeOff } from "lucide-react"

export type ApiKeyStatus = 'idle' | 'validating' | 'success' | 'error'

export interface ApiKeySubmitData {
  apiKey: string
  baseUrl?: string
  connectionDefaultModel?: string
  models?: string[]
  piAuthProvider?: string
}

export interface ApiKeyInputProps {
  /** Current validation status */
  status: ApiKeyStatus
  /** Error message to display when status is 'error' */
  errorMessage?: string
  /** Called when the form is submitted with the key and optional endpoint config */
  onSubmit: (data: ApiKeySubmitData) => void
  /** Form ID for external submit button binding (default: "api-key-form") */
  formId?: string
  /** Disable the input (e.g. during validation) */
  disabled?: boolean
  /** Provider type determines which presets and placeholders to show */
  providerType?: 'anthropic' | 'openai' | 'pi' | 'google' | 'pi_api_key'
  /** Pre-fill values when editing an existing connection */
  initialValues?: {
    apiKey?: string
    baseUrl?: string
    connectionDefaultModel?: string
    activePreset?: string
  }
}

// Preset key — string to support dynamic Pi SDK providers
type PresetKey = string

interface Preset {
  key: PresetKey
  label: string
  url: string
  placeholder?: string
}

// Anthropic provider presets - for Claude Code backend
// Also used by Pi API key flow (same providers, routed via Pi SDK)
const ANTHROPIC_PRESETS: Preset[] = [
  { key: 'anthropic', label: 'Anthropic', url: 'https://api.anthropic.com', placeholder: 'sk-ant-...' },
  { key: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1', placeholder: 'sk-...' },
  { key: 'google', label: 'Google AI Studio', url: 'https://generativelanguage.googleapis.com/v1beta', placeholder: 'AIza...' },
  { key: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', placeholder: 'sk-or-...' },
  { key: 'azure-openai-responses', label: 'Azure OpenAI', url: '', placeholder: 'Paste your key here...' },
  { key: 'amazon-bedrock', label: 'Amazon Bedrock', url: 'https://bedrock-runtime.us-east-1.amazonaws.com', placeholder: 'AKIA...' },
  { key: 'groq', label: 'Groq', url: 'https://api.groq.com/openai/v1', placeholder: 'gsk_...' },
  { key: 'mistral', label: 'Mistral', url: 'https://api.mistral.ai/v1', placeholder: 'Paste your key here...' },
  { key: 'xai', label: 'xAI (Grok)', url: 'https://api.x.ai/v1', placeholder: 'xai-...' },
  { key: 'cerebras', label: 'Cerebras', url: 'https://api.cerebras.ai/v1', placeholder: 'csk-...' },
  { key: 'zai', label: 'z.ai (GLM)', url: 'https://api.z.ai/api/coding/paas/v4', placeholder: 'Paste your key here...' },
  { key: 'huggingface', label: 'Hugging Face', url: 'https://router.huggingface.co/v1', placeholder: 'hf_...' },
  { key: 'vercel-ai-gateway', label: 'Vercel AI Gateway', url: 'https://ai-gateway.vercel.sh', placeholder: 'Paste your key here...' },
  { key: 'custom', label: 'Custom', url: '', placeholder: 'Paste your key here...' },
]

// OpenAI provider presets - for Codex backend
// Only direct OpenAI is supported; 3PP providers (OpenRouter, Vercel, Ollama) should be
// configured via the Anthropic/Claude connection which routes through the Claude Agent SDK.
const OPENAI_PRESETS: Preset[] = [
  { key: 'openai', label: 'OpenAI', url: '' },
]

// Pi provider presets - unified API for 20+ LLM providers
const PI_PRESETS: Preset[] = [
  { key: 'pi', label: 'Craft Agents Backend (Direct)', url: '' },
  { key: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api' },
  { key: 'custom', label: 'Custom', url: '' },
]

// Google AI Studio preset - single endpoint, no custom URL needed
const GOOGLE_PRESETS: Preset[] = [
  { key: 'google', label: 'Google AI Studio', url: '' },
]

const COMPAT_ANTHROPIC_DEFAULTS = 'anthropic/claude-opus-4.6, anthropic/claude-sonnet-4.5, anthropic/claude-haiku-4.5'
const COMPAT_OPENAI_DEFAULTS = 'openai/gpt-5.2-codex, openai/gpt-5.1-codex-mini'

function getPresetsForProvider(providerType: 'anthropic' | 'openai' | 'pi' | 'google' | 'pi_api_key'): Preset[] {
  if (providerType === 'pi_api_key') return ANTHROPIC_PRESETS
  if (providerType === 'google') return GOOGLE_PRESETS
  if (providerType === 'pi') return PI_PRESETS
  return providerType === 'openai' ? OPENAI_PRESETS : ANTHROPIC_PRESETS
}

function getPresetForUrl(url: string, presets: Preset[]): PresetKey {
  const match = presets.find(p => p.key !== 'custom' && p.url === url)
  return match?.key ?? 'custom'
}

function parseModelList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function ApiKeyInput({
  status,
  errorMessage,
  onSubmit,
  formId = "api-key-form",
  disabled,
  providerType = 'anthropic',
  initialValues,
}: ApiKeyInputProps) {
  // Get presets based on provider type
  const presets = getPresetsForProvider(providerType)
  const defaultPreset = presets[0]

  // Compute initial preset: explicit (Pi piAuthProvider), derived from URL, or default
  const initialPreset = initialValues?.activePreset
    ?? (initialValues?.baseUrl ? getPresetForUrl(initialValues.baseUrl, presets) : defaultPreset.key)

  const [apiKey, setApiKey] = useState(initialValues?.apiKey ?? '')
  const [showValue, setShowValue] = useState(false)
  const [baseUrl, setBaseUrl] = useState(initialValues?.baseUrl ?? defaultPreset.url)
  const [activePreset, setActivePreset] = useState<PresetKey>(initialPreset)
  const [connectionDefaultModel, setConnectionDefaultModel] = useState(initialValues?.connectionDefaultModel ?? '')
  const [modelError, setModelError] = useState<string | null>(null)

  const isDisabled = disabled || status === 'validating'

  const isPiApiKeyFlow = providerType === 'pi_api_key'
  // Hide endpoint/model fields for providers with well-known endpoints handled by the SDK
  const DEFAULT_ENDPOINT_PROVIDERS = new Set(['anthropic', 'openai', 'pi', 'google'])
  const isDefaultProviderPreset = DEFAULT_ENDPOINT_PROVIDERS.has(activePreset)

  // Provider-specific placeholders from the active preset
  const activePresetObj = presets.find(p => p.key === activePreset)
  const apiKeyPlaceholder = activePresetObj?.placeholder
    ?? (providerType === 'google' ? 'AIza...'
    : providerType === 'pi' ? 'pi-...'
    : providerType === 'openai' ? 'sk-...'
    : 'Paste your key here...')

  const handlePresetSelect = (preset: Preset) => {
    setActivePreset(preset.key)
    if (preset.key === 'custom') {
      setBaseUrl('')
    } else {
      setBaseUrl(preset.url)
    }
    setModelError(null)
    // Pre-fill recommended model for Ollama; clear for all others
    // (Default provider presets hide the field entirely, others default to provider model IDs when empty)
    if (preset.key === 'ollama') {
      setConnectionDefaultModel('qwen3-coder')
    } else if (preset.key === 'openrouter' || preset.key === 'vercel-ai-gateway') {
      setConnectionDefaultModel(providerType === 'openai' ? COMPAT_OPENAI_DEFAULTS : COMPAT_ANTHROPIC_DEFAULTS)
    } else if (preset.key === 'custom') {
      setConnectionDefaultModel(providerType === 'openai' ? COMPAT_OPENAI_DEFAULTS : COMPAT_ANTHROPIC_DEFAULTS)
    } else {
      setConnectionDefaultModel('')
    }
  }

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value)
    const presetKey = getPresetForUrl(value, presets)
    setActivePreset(presetKey)
    setModelError(null)
    if (!connectionDefaultModel.trim()) {
      if (presetKey === 'ollama') {
        setConnectionDefaultModel('qwen3-coder')
      } else if (presetKey === 'openrouter' || presetKey === 'vercel-ai-gateway' || presetKey === 'custom') {
        setConnectionDefaultModel(providerType === 'openai' ? COMPAT_OPENAI_DEFAULTS : COMPAT_ANTHROPIC_DEFAULTS)
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const effectiveBaseUrl = baseUrl.trim()

    const parsedModels = parseModelList(connectionDefaultModel)

    const isUsingDefaultEndpoint = isDefaultProviderPreset || !effectiveBaseUrl
    const requiresModel = !isDefaultProviderPreset && !!effectiveBaseUrl
    if (requiresModel && parsedModels.length === 0) {
      setModelError('Default model is required for custom endpoints.')
      return
    }

    onSubmit({
      apiKey: apiKey.trim(),
      baseUrl: isUsingDefaultEndpoint ? undefined : effectiveBaseUrl,
      connectionDefaultModel: parsedModels[0],
      models: parsedModels.length > 0 ? parsedModels : undefined,
      piAuthProvider: isPiApiKeyFlow && activePreset !== 'custom' ? activePreset : undefined,
    })
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* API Key */}
      <div className="space-y-2">
        <Label htmlFor="api-key">API Key</Label>
        <div className={cn(
          "relative rounded-md shadow-minimal transition-colors",
          "bg-foreground-2 focus-within:bg-background"
        )}>
          <Input
            id="api-key"
            type={showValue ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={apiKeyPlaceholder}
            className={cn(
              "pr-10 border-0 bg-transparent shadow-none",
              status === 'error' && "focus-visible:ring-destructive"
            )}
            disabled={isDisabled}
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowValue(!showValue)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {showValue ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </div>

      {/* Endpoint/Provider Preset Selector - hidden when only one preset (e.g. Codex/OpenAI direct) */}
      {presets.length > 1 && (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="base-url">Endpoint</Label>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={isDisabled}
              className="flex h-6 items-center gap-1 rounded-[6px] bg-background shadow-minimal pl-2.5 pr-2 text-[12px] font-medium text-foreground/50 hover:bg-foreground/5 hover:text-foreground focus:outline-none"
            >
              {presets.find(p => p.key === activePreset)?.label}
              <ChevronDown className="size-2.5 opacity-50" />
            </DropdownMenuTrigger>
            <StyledDropdownMenuContent align="end" className="z-floating-menu">
              {presets.map((preset) => (
                <StyledDropdownMenuItem
                  key={preset.key}
                  onClick={() => handlePresetSelect(preset)}
                  className="justify-between"
                >
                  {preset.label}
                  <Check className={cn("size-3", activePreset === preset.key ? "opacity-100" : "opacity-0")} />
                </StyledDropdownMenuItem>
              ))}
            </StyledDropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Base URL input - hidden for default provider presets (Anthropic/OpenAI) */}
        {!isDefaultProviderPreset && (
          <div className={cn(
            "rounded-md shadow-minimal transition-colors",
            "bg-foreground-2 focus-within:bg-background"
          )}>
            <Input
              id="base-url"
              type="text"
              value={baseUrl}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              placeholder="https://your-api-endpoint.com"
              className="border-0 bg-transparent shadow-none"
              disabled={isDisabled}
            />
          </div>
        )}
      </div>
      )}

      {/* Model Selection — hidden for providers with built-in model routing (standard presets) */}
      {!isDefaultProviderPreset && (
        <div className="space-y-2">
          <Label htmlFor="connection-default-model" className="text-muted-foreground font-normal">
            Default Model{' '}
            <span className="text-foreground/30">
              · {baseUrl.trim() ? 'required' : 'optional'}
            </span>
          </Label>
          <div className={cn(
            "rounded-md shadow-minimal transition-colors",
            "bg-foreground-2 focus-within:bg-background",
            modelError && "ring-1 ring-destructive/40"
          )}>
            <Input
              id="connection-default-model"
              type="text"
              value={connectionDefaultModel}
              onChange={(e) => {
                setConnectionDefaultModel(e.target.value)
                setModelError(null)
              }}
              placeholder="e.g. anthropic/claude-opus-4.6, anthropic/claude-haiku-4.5"
              className="border-0 bg-transparent shadow-none"
              disabled={isDisabled}
            />
          </div>
          {modelError && (
            <p className="text-xs text-destructive">{modelError}</p>
          )}
          <p className="text-xs text-foreground/30">
            Comma-separated list. The first model is the default. The last is used for summarization.
          </p>
          {(activePreset === 'custom' || !activePreset) && (
            <p className="text-xs text-foreground/30">
              Required for custom endpoints. Use the provider-specific model ID.
            </p>
          )}
        </div>
      )}

      {/* Error message */}
      {status === 'error' && errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </form>
  )
}
