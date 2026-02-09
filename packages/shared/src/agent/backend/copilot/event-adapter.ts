/**
 * Copilot SDK Event Adapter
 *
 * Maps Copilot SDK session events to Craft Agent's AgentEvent format.
 * This enables the CopilotAgent to emit events compatible with the existing UI.
 *
 * The Copilot SDK uses SessionEvent types with discriminated unions on the `type` field.
 */

import type { AgentEvent } from '@craft-agent/core/types';
import type { SessionEvent } from '@github/copilot-sdk';
import { parseReadCommand, type ReadCommandInfo } from '../codex/read-patterns.ts';
import { createLogger } from '../../../utils/debug.ts';

/**
 * Maps Copilot SDK session events to AgentEvents for UI compatibility.
 *
 * Event mapping:
 * - session.start → status
 * - session.resume → status
 * - session.idle → complete
 * - session.error → error
 * - session.compaction_complete → status
 * - session.usage_info → (internal, usage tracking)
 * - assistant.message_delta → text_delta
 * - assistant.message → text_complete
 * - assistant.reasoning_delta → text_delta (intermediate)
 * - assistant.reasoning → text_complete (intermediate)
 * - assistant.turn_start → (internal, turn tracking)
 * - assistant.turn_end → complete
 * - assistant.usage → (usage tracking)
 * - tool.execution_start → tool_start
 * - tool.execution_complete → tool_result
 * - tool.execution_progress → status
 */
export class CopilotEventAdapter {
  private log = createLogger('copilot-event');
  private turnIndex: number = 0;

  // Track tool names from execution_start for proper tool_result correlation
  private toolNames: Map<string, string> = new Map();

  // Track command output for tool results (accumulated from partial results)
  private commandOutput: Map<string, string> = new Map();

  // Track commands detected as file reads (for Read tool display)
  private readCommands: Map<string, ReadCommandInfo> = new Map();

  // Track block reasons for declined tool calls (set by PreToolUse hook)
  private blockReasons: Map<string, string> = new Map();

  // Current turn ID for event correlation
  private currentTurnId: string | null = null;

  /**
   * Store the block reason for a tool call that will be declined.
   * Called from copilot-agent when PreToolUse hook blocks a tool.
   */
  setBlockReason(toolCallId: string, reason: string): void {
    this.log.warn('Tool call block reason recorded', { toolCallId, reason });
    this.blockReasons.set(toolCallId, reason);
  }

  /**
   * Start a new turn - resets indexing and streaming state.
   */
  startTurn(): void {
    this.turnIndex++;
    this.toolNames.clear();
    this.commandOutput.clear();
    this.readCommands.clear();
    this.blockReasons.clear();
    this.currentTurnId = null;
    this.log.debug('Turn started', { turnIndex: this.turnIndex });
  }

  /**
   * Adapt a Copilot SDK SessionEvent to zero or more AgentEvents.
   */
  *adaptEvent(event: SessionEvent): Generator<AgentEvent> {
    switch (event.type) {
      // ============================================================
      // Session lifecycle events
      // ============================================================

      case 'session.start':
        // Internal - session initialized
        break;

      case 'session.resume':
        yield { type: 'status', message: 'Session resumed' };
        break;

      case 'session.idle':
        yield { type: 'complete' };
        break;

      case 'session.error':
        yield { type: 'error', message: event.data.message };
        break;

      case 'session.compaction_start':
        yield { type: 'status', message: 'Compacting context...' };
        break;

      case 'session.compaction_complete':
        if (event.data.success) {
          yield { type: 'status', message: 'Context compacted to fit within limits' };
        } else {
          yield { type: 'error', message: `Context compaction failed: ${event.data.error || 'unknown error'}` };
        }
        break;

      case 'session.usage_info':
        // Internal usage tracking - handled by the agent class directly
        break;

      case 'session.info':
        yield { type: 'status', message: event.data.message };
        break;

      case 'session.model_change':
        yield { type: 'status', message: `Model changed to ${event.data.newModel}` };
        break;

      case 'session.truncation':
        yield {
          type: 'status',
          message: `Context truncated: ${event.data.messagesRemovedDuringTruncation} messages removed`,
        };
        break;

      case 'session.shutdown':
        // Internal shutdown tracking
        break;

      case 'session.snapshot_rewind':
        // Internal snapshot management
        break;

      case 'session.handoff':
        yield { type: 'status', message: `Session handoff: ${event.data.summary || 'transferring'}` };
        break;

      // ============================================================
      // Assistant events
      // ============================================================

      case 'assistant.turn_start':
        this.currentTurnId = event.data.turnId;
        break;

      case 'assistant.turn_end':
        yield { type: 'complete' };
        this.currentTurnId = null;
        break;

      case 'assistant.message_delta':
        if (event.data.deltaContent) {
          yield {
            type: 'text_delta',
            text: event.data.deltaContent,
            turnId: this.currentTurnId || undefined,
          };
        }
        break;

      case 'assistant.message':
        if (event.data.content) {
          yield {
            type: 'text_complete',
            text: event.data.content,
            turnId: this.currentTurnId || undefined,
          };
        }
        break;

      case 'assistant.reasoning_delta':
        if (event.data.deltaContent) {
          yield {
            type: 'text_delta',
            text: event.data.deltaContent,
            turnId: this.currentTurnId || undefined,
          };
        }
        break;

      case 'assistant.reasoning':
        if (event.data.content) {
          yield {
            type: 'text_complete',
            text: event.data.content,
            isIntermediate: true,
            turnId: this.currentTurnId || undefined,
          };
        }
        break;

      case 'assistant.intent':
        // Internal intent tracking
        break;

      case 'assistant.usage':
        // Usage tracking - handled by the agent class directly
        break;

      // ============================================================
      // Tool events
      // ============================================================

      case 'tool.execution_start': {
        const toolName = this.resolveToolName(event.data);
        this.toolNames.set(event.data.toolCallId, toolName);

        const args = (event.data.arguments ?? {}) as Record<string, unknown>;
        const intent = (event.data as { description?: string }).description || undefined;
        const displayName = this.getToolDisplayName(toolName);

        // Classify bash commands that are actually file reads
        if (toolName === 'Bash' && typeof args.command === 'string') {
          const readInfo = parseReadCommand(args.command);
          if (readInfo) {
            this.readCommands.set(event.data.toolCallId, readInfo);
            yield {
              type: 'tool_start',
              toolName: 'Read',
              toolUseId: event.data.toolCallId,
              input: {
                file_path: readInfo.filePath,
                offset: readInfo.startLine,
                limit: readInfo.endLine
                  ? readInfo.endLine - (readInfo.startLine || 1) + 1
                  : undefined,
                _command: readInfo.originalCommand,
              },
              intent,
              displayName: 'Read File',
              turnId: this.currentTurnId || undefined,
            };
            break;
          }
        }

        yield {
          type: 'tool_start',
          toolName,
          toolUseId: event.data.toolCallId,
          input: args,
          intent,
          displayName,
          turnId: this.currentTurnId || undefined,
        };
        break;
      }

      case 'tool.execution_complete': {
        const toolCallId = event.data.toolCallId;

        const blockReason = this.blockReasons.get(toolCallId);
        if (blockReason) {
          this.blockReasons.delete(toolCallId);
        }

        // Resolve original tool name from execution_start
        const resolvedToolName = this.toolNames.get(toolCallId) || 'tool';
        this.toolNames.delete(toolCallId);

        // Use accumulated output from partial results if available
        const accumulatedOutput = this.commandOutput.get(toolCallId);
        this.commandOutput.delete(toolCallId);

        const isError = !event.data.success;
        let result: string;

        if (accumulatedOutput) {
          result = accumulatedOutput;
        } else if (event.data.error) {
          result = blockReason || event.data.error.message;
        } else if (event.data.result) {
          result = event.data.result.content;
        } else {
          result = blockReason || (isError ? 'Tool execution failed' : 'Success');
        }

        // Check if this was classified as a file read
        const readInfo = this.readCommands.get(toolCallId);
        if (readInfo) {
          this.readCommands.delete(toolCallId);
          yield {
            type: 'tool_result',
            toolUseId: toolCallId,
            toolName: 'Read',
            result,
            isError,
            turnId: this.currentTurnId || undefined,
          };
          break;
        }

        yield {
          type: 'tool_result',
          toolUseId: toolCallId,
          toolName: resolvedToolName,
          result,
          isError,
          turnId: this.currentTurnId || undefined,
        };
        break;
      }

      case 'tool.execution_progress':
        yield { type: 'status', message: event.data.progressMessage };
        break;

      case 'tool.execution_partial_result': {
        const id = event.data.toolCallId;
        const content = event.data.partialOutput || '';
        const existing = this.commandOutput.get(id) || '';
        this.commandOutput.set(id, existing + content);
        break;
      }

      case 'tool.user_requested':
        // User-initiated tool call
        break;

      // ============================================================
      // Other events
      // ============================================================

      case 'user.message':
        // User messages don't need events
        break;

      case 'pending_messages.modified':
        // Internal queue management
        break;

      case 'abort':
        yield { type: 'status', message: `Aborted: ${event.data.reason}` };
        break;

      case 'skill.invoked':
        yield { type: 'status', message: `Skill invoked: ${event.data.name}` };
        break;

      case 'subagent.started':
        yield {
          type: 'tool_start',
          toolName: `SubAgent:${event.data.agentName}`,
          toolUseId: event.data.toolCallId,
          input: { description: event.data.agentDescription },
          turnId: this.currentTurnId || undefined,
        };
        break;

      case 'subagent.completed':
        yield {
          type: 'tool_result',
          toolUseId: event.data.toolCallId,
          toolName: `SubAgent:${event.data.agentName}`,
          result: 'Sub-agent task completed',
          isError: false,
          turnId: this.currentTurnId || undefined,
        };
        break;

      case 'subagent.failed':
        yield {
          type: 'tool_result',
          toolUseId: event.data.toolCallId,
          toolName: `SubAgent:${event.data.agentName}`,
          result: event.data.error,
          isError: true,
          turnId: this.currentTurnId || undefined,
        };
        break;

      case 'subagent.selected':
        yield { type: 'status', message: `Agent selected: ${event.data.agentDisplayName}` };
        break;

      case 'hook.start':
      case 'hook.end':
        // Internal hook lifecycle
        break;

      case 'system.message':
        // System messages are internal
        break;

      default:
        // TODO: If Copilot SDK emits plan events (e.g., 'plan.updated'),
        // map them to todos_updated events with status normalization
        this.log.warn(`Unknown Copilot event type: ${(event as { type: string }).type}`);
        break;
    }
  }

  /**
   * Resolve the display tool name from execution_start event data.
   * Maps MCP tool calls to mcp__server__tool format.
   */
  private resolveToolName(data: {
    toolName: string;
    mcpServerName?: string;
    mcpToolName?: string;
  }): string {
    if (data.mcpServerName && data.mcpToolName) {
      return `mcp__${data.mcpServerName}__${data.mcpToolName}`;
    }
    return data.toolName;
  }

  /**
   * Get a human-readable display name for a tool.
   */
  private getToolDisplayName(toolName: string): string | undefined {
    switch (toolName) {
      case 'Bash':
        return 'Run Command';
      case 'Read':
        return 'Read File';
      case 'Write':
        return 'Write File';
      case 'Edit':
        return 'Edit File';
      case 'Glob':
        return 'Search Files';
      case 'Grep':
        return 'Search Content';
      default:
        return undefined;
    }
  }
}
