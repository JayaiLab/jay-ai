// Emulate a DOM EventTarget class for pub/sub pattern with typed events.


export interface Event {
    readonly type: string;
}

export type EventListener<TEvents extends Record<string, Event>> = (e: TEvents[keyof TEvents]) => void;

export class EventTarget<TEvents extends Record<string, Event>> {
    private listeners: Record<string, EventListener<TEvents>[]> = {};

    constructor() {
        this.listeners = {};
    }

    addEventListener<TEventType extends keyof TEvents & string>(type: TEventType, listener: EventListener<TEvents>) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(listener);
    }

    removeEventListener<TEventType extends keyof TEvents & string>(type: TEventType, listener: EventListener<TEvents>) {
        this.listeners[type] = this.listeners[type].filter(l => l !== listener);
    }

    dispatchEvent<TEventType extends keyof TEvents & string>(event: TEvents[TEventType]) {
        const listeners = this.listeners[event.type];
        if (listeners) {
            listeners.forEach(listener => listener(event));
        }
    }
}
