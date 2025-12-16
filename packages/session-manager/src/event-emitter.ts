/**
 * Type-safe event emitter for SessionManager
 */

type EventHandler<T> = (data: T) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class TypedEventEmitter<Events extends { [K in keyof Events]: any }> {
  private listeners = new Map<keyof Events, Set<EventHandler<unknown>>>();

  /**
   * Subscribe to an event
   */
  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler<unknown>);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(handler as EventHandler<unknown>);
    };
  }

  /**
   * Subscribe to an event once
   */
  once<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    const wrappedHandler = (data: Events[K]) => {
      this.off(event, wrappedHandler);
      handler(data);
    };
    return this.on(event, wrappedHandler);
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void {
    this.listeners.get(event)?.delete(handler as EventHandler<unknown>);
  }

  /**
   * Emit an event
   */
  protected emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${String(event)}:`, error);
        }
      }
    }
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * Get listener count for an event
   */
  listenerCount<K extends keyof Events>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
