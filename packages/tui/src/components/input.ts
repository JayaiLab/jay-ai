import { Component } from "../compotent";

/**
 * A single-line text input component for use within the component tree.
 * Used for inline text entry (e.g., pasting an auth code during login).
 * Does not emit CURSOR_MARKER — the hardware cursor stays hidden while this is active.
 */
export class InputComponent implements Component {
    private buffer: string = "";
    private cursorPos: number = 0;
    private resolved: boolean = false;
    private resolveCallback: ((value: string) => void) | null = null;

    constructor(private label: string) {}

    /** Handle a key press. Returns true if the key was consumed. */
    handleKey(key: string): boolean {
        if (this.resolved) return false;

        if (key === "\r") {
            this.resolved = true;
            if (this.resolveCallback) {
                this.resolveCallback(this.buffer.trim());
            }
            return true;
        } else if (key === "\x7f") {
            if (this.cursorPos > 0) {
                this.buffer =
                    this.buffer.slice(0, this.cursorPos - 1) +
                    this.buffer.slice(this.cursorPos);
                this.cursorPos--;
            }
            return true;
        } else if (key === "\x1b[D") {
            if (this.cursorPos > 0) this.cursorPos--;
            return true;
        } else if (key === "\x1b[C") {
            if (this.cursorPos < this.buffer.length) this.cursorPos++;
            return true;
        } else if (key.startsWith("\x1b")) {
            return false;
        } else if (key >= " ") {
            this.buffer =
                this.buffer.slice(0, this.cursorPos) +
                key +
                this.buffer.slice(this.cursorPos);
            this.cursorPos++;
            return true;
        }
        return false;
    }

    /** Returns a promise that resolves with the input text when Enter is pressed. */
    waitForInput(): Promise<string> {
        if (this.resolved) {
            return Promise.resolve(this.buffer.trim());
        }
        return new Promise((resolve) => {
            this.resolveCallback = resolve;
        });
    }

    render(_width: number): string[] {
        if (this.resolved) {
            return [`${this.label}${this.buffer}`];
        }
        return [`${this.label}${this.buffer}`];
    }
}
