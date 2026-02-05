/**
 * Call LLM Handler
 *
 * Invokes a secondary Claude model for focused subtasks.
 * Supports attachments, structured output, and extended thinking.
 */

import type { SessionToolContext, LlmCallParams } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { errorResponse, successResponse } from '../response.ts';

export interface CallLlmArgs {
  prompt: string;
  attachments?: Array<string | { path: string; startLine?: number; endLine?: number }>;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  thinking?: boolean;
  thinkingBudget?: number;
  outputFormat?: 'summary' | 'classification' | 'extraction' | 'analysis' | 'comparison' | 'validation';
  outputSchema?: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Handle the call_llm tool call.
 *
 * This handler delegates to the context's callLlm method if available.
 * The actual implementation differs between Claude and Codex:
 * - Claude: Uses SDK or direct API
 * - Codex: Uses Anthropic SDK with API key from env
 */
export async function handleCallLlm(
  ctx: SessionToolContext,
  args: CallLlmArgs
): Promise<ToolResult> {
  // Check if call_llm is available in this context
  if (!ctx.callLlm) {
    return errorResponse(
      'call_llm is not available in this context.\n\n' +
      'This may be because:\n' +
      '1. No Anthropic API key is configured\n' +
      '2. The feature is not enabled for this agent type'
    );
  }

  // Validate prompt
  if (!args.prompt?.trim()) {
    return errorResponse('Prompt is required and cannot be empty.');
  }

  // Validate mutual exclusions
  if (args.thinking && (args.outputFormat || args.outputSchema)) {
    return errorResponse(
      'Cannot use thinking with structured output.\n\n' +
      'Options:\n' +
      '1. Remove thinking=true to use outputFormat/outputSchema\n' +
      '2. Remove outputFormat/outputSchema to use thinking\n\n' +
      'These features use incompatible API modes.'
    );
  }

  if (args.outputFormat && args.outputSchema) {
    return errorResponse(
      'Cannot use both outputFormat and outputSchema.\n\n' +
      'Options:\n' +
      '1. Use outputFormat for predefined schemas (summary, classification, etc.)\n' +
      '2. Use outputSchema for custom JSON Schema'
    );
  }

  if (args.thinkingBudget && !args.thinking) {
    return errorResponse(
      'thinkingBudget requires thinking=true.\n\n' +
      'Add thinking=true to enable extended thinking, or remove thinkingBudget.'
    );
  }

  // Build params
  const params: LlmCallParams = {
    prompt: args.prompt,
    attachments: args.attachments,
    model: args.model,
    systemPrompt: args.systemPrompt,
    maxTokens: args.maxTokens,
    temperature: args.temperature,
    thinking: args.thinking,
    thinkingBudget: args.thinkingBudget,
    outputFormat: args.outputFormat,
    outputSchema: args.outputSchema,
  };

  // Call the LLM
  const result = await ctx.callLlm(params);

  if (!result.success) {
    return errorResponse(result.error || 'Unknown error calling LLM');
  }

  return successResponse(result.content || '(Empty response)');
}
