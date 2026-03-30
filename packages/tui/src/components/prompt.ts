import { Component } from "../compotent";

export const CURSOR_MARKER = "\x1b_pi:c\x07";

export class PromptComponent implements Component {
    private inputBuffer: string = "";
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
            if (input) this.onSubmit(input);
        } else if (key === "\x7f") {
            this.inputBuffer = this.inputBuffer.slice(0, -1);
        } else if (key.startsWith("\x1b")) {
            // Ignore escape sequences (arrow keys, etc.)
        } else if (key >= " ") {
            this.inputBuffer += key;
        }
    }
    private renderDivider(): string {
        return `\x1b[94m${"─".repeat(process.stdout.columns ?? 80)}\x1b[0m`;
    }
    render(): string {
        return `${this.renderDivider()}\n> ${this.inputBuffer}${CURSOR_MARKER}\n${this.renderDivider()}`;
    }
}
