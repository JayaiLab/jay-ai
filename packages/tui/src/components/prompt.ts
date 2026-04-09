import { Component } from "../compotent";

export const CURSOR_MARKER = "\x1b_pi:c\x07";

export class PromptComponent implements Component {
    private inputBuffer: string = "";
    private cursorPos: number = 0; // index within inputBuffer
    private enabled: boolean = true;

    constructor(private readonly onSubmit: (input: string) => void) { }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    handleKey(key: string): void {
        if (!this.enabled) return;
        if (key === "\r") {
            const input = this.inputBuffer.trim();
            this.inputBuffer = "";
            this.cursorPos = 0;
            if (input) this.onSubmit(input);
        } else if (key === "\x7f") {
            if (this.cursorPos > 0) {
                this.inputBuffer =
                    this.inputBuffer.slice(0, this.cursorPos - 1) +
                    this.inputBuffer.slice(this.cursorPos);
                this.cursorPos--;
            }
        } else if (key === "\x1b[D") {
            // Left arrow
            if (this.cursorPos > 0) this.cursorPos--;
        } else if (key === "\x1b[C") {
            // Right arrow
            if (this.cursorPos < this.inputBuffer.length) this.cursorPos++;
        } else if (key.startsWith("\x1b")) {
            // Ignore other escape sequences
        } else if (key >= " ") {
            this.inputBuffer =
                this.inputBuffer.slice(0, this.cursorPos) +
                key +
                this.inputBuffer.slice(this.cursorPos);
            this.cursorPos++;
        }
    }

    render(width: number): string[] {
        if (!this.enabled) return [];
        const divider = `\x1b[94m${"─".repeat(width)}\x1b[0m`;
        const before = this.inputBuffer.slice(0, this.cursorPos);
        const after = this.inputBuffer.slice(this.cursorPos);
        return [
            divider,
            `> ${before}${CURSOR_MARKER}${after}`,
            divider,
        ];
    }
}
