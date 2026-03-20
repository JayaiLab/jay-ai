import { EventTarget, EventListener } from "./event-target";

function stripAnsi(text: string): string {
    return text
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')   // CSI sequences
        .replace(/\x1b\][^\x07]*\x07/g, '')        // OSC sequences (\x07 terminated)
        .replace(/\x1b\][^\x1b]*\x1b\\/g, '')      // OSC sequences (ST terminated)
        .replace(/\x1b./g, '');                     // other 2-char ESC sequences
}

function countLines(text: string, width: number): number {
    const stripped = stripAnsi(text);
    let count = 0;
    for (const line of stripped.split('\n')) {
        count += Math.max(1, Math.ceil(line.length / width));
    }
    return count - 1;
}

export type TerminalEvents = {
    inputSubmitted: { type: "inputSubmitted", input: string };
    resize: { type: "resize", columns: number, rows: number };
};

export class Terminal {
    private emitter: EventTarget<TerminalEvents> = new EventTarget();
    private inputBuffer: string = "";
    private lastLineCount: number = 0;
    constructor() {
        process.stdin.setRawMode(true);
        process.stdin.on("data", (data: Buffer) => this.onData(data));
        process.stdout.on("resize", () => {
            this.emitter.dispatchEvent({ type: "resize", columns: process.stdout.columns, rows: process.stdout.rows });
        });
    }

    addEventListener<TEventType extends keyof TerminalEvents & string>(type: TEventType, listener: EventListener<TerminalEvents, TEventType>) {
        this.emitter.addEventListener(type, listener);
    }

    removeEventListener<TEventType extends keyof TerminalEvents & string>(type: TEventType, listener: EventListener<TerminalEvents, TEventType>) {
        this.emitter.removeEventListener(type, listener);
    }

    write(text: string) {
        process.stdout.write(text);
    }

    resetRewrite(): void {
        this.lastLineCount = 0;
    }

    rewrite(text: string): void {
        if (this.lastLineCount > 0) {
            process.stdout.write(`\x1b[${this.lastLineCount}A`); // cursor up N lines
            process.stdout.write(`\x1b[G`);                      // cursor to col 1
            process.stdout.write(`\x1b[0J`);                     // clear to end of screen
        }
        process.stdout.write(text);
        this.lastLineCount = countLines(text, process.stdout.columns ?? 80);
    }

    onData(data: Buffer) {
        const key = data.toString();
        if (key === "\x03") process.exit(); // Ctrl+C = exit
        else if (key === "\r") { // user pressed enter key
            this.write("\n");
            this.emitter.dispatchEvent({ type: "inputSubmitted", input: this.inputBuffer.trim() });
            this.inputBuffer = "";
        } else if (key === "\x7f") { // user pressed backspace key
            if (this.inputBuffer.length > 0) {
                this.inputBuffer = this.inputBuffer.slice(0, -1);
                this.write("\b \b"); // move back, erase char, move back again
            }
        } else {
            this.inputBuffer += key;
            this.write(key);
        }
    }
}
