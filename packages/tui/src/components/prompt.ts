import { Component } from "../compotent";
import { wrapLines } from "../wrap";

export const CURSOR_MARKER = "\x1b_pi:c\x07";

export class PromptComponent implements Component {
    private inputBuffer: string = "";
    private cursorPos: number = 0; // index within inputBuffer
    private enabled: boolean = true;

    constructor(private readonly onSubmit: (input: string) => void) { }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    get isEmpty(): boolean {
        return this.inputBuffer.length === 0;
    }

    clear(): void {
        this.inputBuffer = "";
        this.cursorPos = 0;
    }

    handleKey(key: string): void {
        if (!this.enabled) return;
        if (key === "\x03") {
            // The first Ctrl+C clears the prompt. The second Ctrl+C exits the program.
            if (this.isEmpty) {
                process.exit();
            } else {
                this.clear();
            }
            return;
        } else if (key === "\x1b\r") {
            // Option+Enter: insert a newline
            this.inputBuffer =
                this.inputBuffer.slice(0, this.cursorPos) +
                "\n" +
                this.inputBuffer.slice(this.cursorPos);
            this.cursorPos++;
        } else if (key === "\r") {
            // Enter: submit the input
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
        } else if (key === "\x1b[1;3D" || key === "\x1bb") {
            // Option+Left: move cursor back one word
            this.cursorPos = this.findWordBoundaryLeft();
        } else if (key === "\x1b[1;3C" || key === "\x1bf") {
            // Option+Right: move cursor forward one word
            this.cursorPos = this.findWordBoundaryRight();
        } else if (key.startsWith("\x1b")) {
            // Ignore other escape sequences
        } else if (key.length > 1 || key >= " ") {
            this.inputBuffer =
                this.inputBuffer.slice(0, this.cursorPos) +
                key +
                this.inputBuffer.slice(this.cursorPos);
            this.cursorPos += key.length;
        }
    }

    private findWordBoundaryLeft(): number {
        let pos = this.cursorPos;
        // Skip spaces
        while (pos > 0 && this.inputBuffer[pos - 1] === " ") pos--;
        // Skip word characters
        while (pos > 0 && this.inputBuffer[pos - 1] !== " ") pos--;
        return pos;
    }

    private findWordBoundaryRight(): number {
        let pos = this.cursorPos;
        const len = this.inputBuffer.length;
        // Skip word characters
        while (pos < len && this.inputBuffer[pos] !== " ") pos++;
        // Skip spaces
        while (pos < len && this.inputBuffer[pos] === " ") pos++;
        return pos;
    }

    private static readonly MAX_DISPLAY_LINES = 10;

    render(width: number): string[] {
        if (!this.enabled) return [];
        const divider = `\x1b[94m${"─".repeat(width)}\x1b[0m`;
        const before = this.inputBuffer.slice(0, this.cursorPos);
        const after = this.inputBuffer.slice(this.cursorPos);
        const inputText = `${before}${CURSOR_MARKER}${after}`;
        const wrappedLines = wrapLines(inputText, width);

        let lines: string[];
        if (wrappedLines.length > PromptComponent.MAX_DISPLAY_LINES) {
            const firstLine = wrappedLines[0];
            const pastedCount = wrappedLines.length - 1;
            lines = [
                firstLine,
                `\x1b[90m+ [pasted ${pastedCount} lines]\x1b[0m`,
            ];
        } else {
            lines = wrappedLines;
        }

        return [
            divider,
            ...lines,
            divider,
        ];
    }
}
