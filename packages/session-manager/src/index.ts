/**
 * @craft-agent/session-manager
 *
 * Session orchestration and event management for Craft Agent.
 * Provides a reactive interface for UI components to subscribe to state changes.
 */

export { TypedEventEmitter } from './event-emitter.ts';
export {
  SessionManager,
  type SessionManagerEvents,
  type SessionManagerConfig,
  type PermissionRequest,
  type QuestionRequest,
} from './session-manager.ts';
