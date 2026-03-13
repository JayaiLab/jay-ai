import { EventTarget, EventListener } from "./event-target";

export type TerminalEvents = {
    inputSubmitted: { type: "inputSubmitted", input: string };
};

export class Terminal extends EventTarget<TerminalEvents> {
    private inputBuffer: string = "";

    constructor() {
        super();
        process.stdin.setRawMode(true);
        process.stdin.on("data", (data: Buffer) => this.onData(data));
        this.inputBuffer = "";
    }

    write(text: string) {
        process.stdout.write(text);
    }

    onData(data: Buffer) {
        const key = data.toString();
        if (key === "\x03") process.exit(); // Ctrl+C = exit
        else if (key === "\r") {
            this.write("\n");
            this.dispatchEvent({ type: "inputSubmitted", input: this.inputBuffer.trim() });
            this.inputBuffer = "";
        } else if (key === "\x7f") {
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