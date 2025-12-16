/**
 * SessionManager - Core orchestration for CraftAgent and session state
 *
 * This is the main abstraction used by both TUI and Electron apps.
 * It wraps CraftAgent and provides:
 * - Message state management
 * - Event streaming to UI
 * - Session persistence
 * - Permission and question handling
 */

import { TypedEventEmitter } from './event-emitter.ts';
import type {
  Session,
  Message,
  TokenUsage,
  AgentEvent,
  TypedError,
  Question,
} from '@craft-agent/core';

/**
 * Events emitted by SessionManager
 */
export interface SessionManagerEvents {
  // Message events
  'message:add': Message;
  'message:update': { id: string; updates: Partial<Message> };
  'message:remove': string;

  // Streaming events
  'stream:text': string;
  'stream:clear': void;

  // Processing state
  'processing:start': void;
  'processing:end': void;

  // Token usage
  'token:update': TokenUsage;

  // Permission requests
  'permission:request': PermissionRequest;
  'permission:resolve': string; // requestId

  // Question requests (AskUserQuestion)
  'question:request': QuestionRequest;
  'question:resolve': string; // requestId

  // Errors
  'error': TypedError;
  'error:message': string;

  // Session lifecycle
  'session:ready': void;
  'session:disposed': void;
}

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  command: string;
  description: string;
}

export interface QuestionRequest {
  requestId: string;
  questions: Question[];
}

export interface SessionManagerConfig {
  /** Session to manage */
  session: Session;
  /** Model to use */
  model?: string;
  /** Callback to resolve permission requests */
  onPermissionRequest?: (request: PermissionRequest) => Promise<{ allowed: boolean; alwaysAllow?: boolean }>;
  /** Callback to resolve question requests */
  onQuestionRequest?: (request: QuestionRequest) => Promise<Record<string, string>>;
}

/**
 * SessionManager orchestrates CraftAgent and provides a reactive interface
 * for UI components to subscribe to state changes.
 */
export class SessionManager extends TypedEventEmitter<SessionManagerEvents> {
  private session: Session;
  private messages: Message[] = [];
  private tokenUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    contextTokens: 0,
    costUsd: 0,
  };
  private isProcessing = false;
  private streamingText = '';
  private disposed = false;

  // Pending requests
  private pendingPermissions = new Map<string, {
    resolve: (result: { allowed: boolean; alwaysAllow?: boolean }) => void;
    reject: (error: Error) => void;
  }>();
  private pendingQuestions = new Map<string, {
    resolve: (answers: Record<string, string>) => void;
    reject: (error: Error) => void;
  }>();

  // Tool tracking (for matching tool results to tool calls)
  private pendingTools = new Map<string, { toolName: string; startTime: number }>();

  constructor(private config: SessionManagerConfig) {
    super();
    this.session = config.session;
  }

  /**
   * Get current session
   */
  getSession(): Session {
    return { ...this.session };
  }

  /**
   * Get all messages
   */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * Get token usage
   */
  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }

  /**
   * Check if currently processing
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  /**
   * Get streaming text
   */
  getStreamingText(): string {
    return this.streamingText;
  }

  /**
   * Add a message
   */
  addMessage(message: Message): void {
    this.messages.push(message);
    this.emit('message:add', message);
  }

  /**
   * Update a message
   */
  updateMessage(id: string, updates: Partial<Message>): void {
    const index = this.messages.findIndex(m => m.id === id);
    if (index !== -1) {
      this.messages[index] = { ...this.messages[index]!, ...updates };
      this.emit('message:update', { id, updates });
    }
  }

  /**
   * Process an AgentEvent from CraftAgent
   */
  processEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'text_delta':
        this.streamingText += event.text;
        this.emit('stream:text', event.text);
        break;

      case 'text_complete': {
        const assistantMessage: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'assistant',
          content: event.text,
          timestamp: Date.now(),
        };
        this.addMessage(assistantMessage);
        this.streamingText = '';
        this.emit('stream:clear', undefined);
        break;
      }

      case 'tool_start': {
        const toolMessage: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'tool',
          content: '',
          timestamp: Date.now(),
          toolName: event.toolName,
          toolUseId: event.toolUseId,
          toolInput: event.input,
          toolIntent: event.intent,
          toolStatus: 'executing',
        };
        this.addMessage(toolMessage);
        this.pendingTools.set(event.toolUseId, {
          toolName: event.toolName,
          startTime: Date.now(),
        });
        break;
      }

      case 'tool_result': {
        const pending = this.pendingTools.get(event.toolUseId);
        if (pending) {
          const duration = Date.now() - pending.startTime;
          // Find the tool message and update it
          const toolMessage = this.messages.find(m => m.toolUseId === event.toolUseId);
          if (toolMessage) {
            this.updateMessage(toolMessage.id, {
              toolResult: event.result,
              toolStatus: event.isError ? 'error' : 'completed',
              toolDuration: duration,
              isError: event.isError,
            });
          }
          this.pendingTools.delete(event.toolUseId);
        }
        break;
      }

      case 'permission_request': {
        const request: PermissionRequest = {
          requestId: event.requestId,
          toolName: event.toolName,
          command: event.command,
          description: event.description,
        };
        this.emit('permission:request', request);

        // If config has a handler, use it
        if (this.config.onPermissionRequest) {
          this.config.onPermissionRequest(request)
            .then(result => this.respondToPermission(event.requestId, result.allowed, result.alwaysAllow))
            .catch(err => console.error('Permission request handler error:', err));
        }
        break;
      }

      case 'ask_user': {
        const request: QuestionRequest = {
          requestId: event.requestId,
          questions: event.questions,
        };
        this.emit('question:request', request);

        // If config has a handler, use it
        if (this.config.onQuestionRequest) {
          this.config.onQuestionRequest(request)
            .then(answers => this.respondToQuestion(event.requestId, answers))
            .catch(err => console.error('Question request handler error:', err));
        }
        break;
      }

      case 'error':
        this.emit('error:message', event.message);
        break;

      case 'typed_error':
        this.emit('error', event.error);
        break;

      case 'complete':
        if (event.usage) {
          this.tokenUsage = event.usage;
          this.emit('token:update', event.usage);
        }
        this.setProcessing(false);
        break;

      case 'status':
        // Status messages can be displayed in UI
        break;
    }
  }

  /**
   * Set processing state
   */
  private setProcessing(processing: boolean): void {
    if (this.isProcessing !== processing) {
      this.isProcessing = processing;
      if (processing) {
        this.emit('processing:start', undefined);
      } else {
        this.emit('processing:end', undefined);
      }
    }
  }

  /**
   * Respond to a permission request
   */
  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void {
    const pending = this.pendingPermissions.get(requestId);
    if (pending) {
      pending.resolve({ allowed, alwaysAllow });
      this.pendingPermissions.delete(requestId);
      this.emit('permission:resolve', requestId);
    }
  }

  /**
   * Respond to a question request
   */
  respondToQuestion(requestId: string, answers: Record<string, string>): void {
    const pending = this.pendingQuestions.get(requestId);
    if (pending) {
      pending.resolve(answers);
      this.pendingQuestions.delete(requestId);
      this.emit('question:resolve', requestId);
    }
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    const removedIds = this.messages.map(m => m.id);
    this.messages = [];
    this.streamingText = '';
    this.emit('stream:clear', undefined);
    for (const id of removedIds) {
      this.emit('message:remove', id);
    }
  }

  /**
   * Dispose the session manager
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Reject any pending requests
    for (const [, pending] of this.pendingPermissions) {
      pending.reject(new Error('Session disposed'));
    }
    for (const [, pending] of this.pendingQuestions) {
      pending.reject(new Error('Session disposed'));
    }

    this.pendingPermissions.clear();
    this.pendingQuestions.clear();
    this.pendingTools.clear();

    this.emit('session:disposed', undefined);
    this.removeAllListeners();
  }
}
