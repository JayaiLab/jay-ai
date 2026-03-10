import { AssistantMessage, AssistantMessageStreamEvent } from "./types/messages";
export class EventStream<T, R> implements AsyncIterable<T> {
  private queue: T[] = [];
  private resolvers: Array<(value: IteratorResult<T>) => void> = [];
  private done = false;
  private error: unknown = undefined;
  private finalOutput: R | undefined = undefined;
  push(event: T): void {
    if (this.done) throw new Error("Cannot push to a closed EventStream");

    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  close(): void {
    this.done = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined as never, done: true });
    }
    this.resolvers = [];
  }

  abort(error: unknown): void {
    this.error = error;
    this.done = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined as never, done: true });
    }
    this.resolvers = [];
  }

  setFinalOutput(output: R): void {
    this.finalOutput = output;
  }

  getFinalOutput(): R | undefined {
    return this.finalOutput;
  }


  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        // if there is an event in the queue, return it
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }

        if (this.error !== undefined) {
          return Promise.reject(this.error);
        }

        if (this.done) {
          return Promise.resolve({ value: undefined as never, done: true });
        }
        // nothing is in the queue when next is called, so we store the resolver and pass once it becomes available. 

        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}

export class AssistantMessageEventStream extends EventStream<AssistantMessageStreamEvent, AssistantMessage> {
  constructor() {
    super();
  }
}

