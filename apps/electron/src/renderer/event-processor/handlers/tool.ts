/**
 * Tool Event Handlers
 *
 * Handles tool_start and tool_result events.
 * Pure functions that return new state - no side effects.
 */

import type { SessionState, ToolStartEvent, ToolResultEvent } from '../types'
import type { Message } from '../../../shared/types'
import {
  findToolMessage,
  updateMessageAt,
  appendMessage,
  generateMessageId
} from '../helpers'

/**
 * Handle tool_start - create or update tool message
 *
 * SDK sends two events per tool: first from stream_event (empty input),
 * second from assistant message (complete input). We handle both.
 */
export function handleToolStart(
  state: SessionState,
  event: ToolStartEvent
): SessionState {
  const { session, streaming } = state

  // Check if tool message already exists (SDK sends two events)
  const existingIndex = findToolMessage(session.messages, event.toolUseId)

  if (existingIndex !== -1) {
    // Update with complete input (second event has full input)
    const updatedSession = updateMessageAt(session, existingIndex, {
      toolInput: event.toolInput,
      toolIntent: event.toolIntent,
      toolDisplayName: event.toolDisplayName,
      turnId: event.turnId,
      parentToolUseId: event.parentToolUseId,
    })
    return { session: updatedSession, streaming }
  }

  // Create new tool message
  const toolMessage: Message = {
    id: generateMessageId(),
    role: 'tool',
    content: '',
    timestamp: Date.now(),
    toolUseId: event.toolUseId,
    toolName: event.toolName,
    toolInput: event.toolInput,
    toolStatus: 'executing',
    turnId: event.turnId,
    parentToolUseId: event.parentToolUseId,
    toolIntent: event.toolIntent,
    toolDisplayName: event.toolDisplayName,
  }

  return {
    session: appendMessage(session, toolMessage),
    streaming,
  }
}

/**
 * Handle tool_result - complete tool execution
 *
 * Updates the tool message with result. If tool not found (out-of-order),
 * creates the tool message with result included.
 */
export function handleToolResult(
  state: SessionState,
  event: ToolResultEvent
): SessionState {
  const { session, streaming } = state

  const toolIndex = findToolMessage(session.messages, event.toolUseId)

  if (toolIndex !== -1) {
    // Update existing tool message
    const updatedSession = updateMessageAt(session, toolIndex, {
      toolResult: event.result,
      toolStatus: 'completed',
      isError: event.isError,
    })
    return { session: updatedSession, streaming }
  }

  // Tool not found - create it with result
  // This handles out-of-order events where result arrives before start
  const toolMessage: Message = {
    id: generateMessageId(),
    role: 'tool',
    content: '',
    timestamp: Date.now(),
    toolUseId: event.toolUseId,
    toolName: event.toolName,
    toolResult: event.result,
    toolStatus: 'completed',
    isError: event.isError,
    turnId: event.turnId,
    parentToolUseId: event.parentToolUseId,
  }

  return {
    session: appendMessage(session, toolMessage),
    streaming,
  }
}
