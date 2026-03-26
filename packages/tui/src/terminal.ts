import { EventTarget, EventListener } from "./event-target";

export type TerminalEvents = {
    inputSubmitted: { type: "inputSubmitted", input: string };
    resize: { type: "resize", columns: number, rows: number };
};

/**
 * Terminal with incremental rewriting.
 *
 * Instead of re-rendering the entire assistant message and using cursor-up to
 * clear it (which fails when content scrolls past the terminal top), we track
 * every line ever written and diff against the previous render. Streaming tokens
 * typically change only the last 1-2 lines, so cursor movement stays small and
 * never needs to cross the terminal boundary.
 *
 * Key state:
 *   lines[]           – every line written this session (split on \n)
 *   absoluteCursorRow  – which line the cursor sits on (0-indexed from session start)
 *   rewriteStart       – index into lines[] where the rewritable section begins
 */
export class Terminal {
    private emitter: EventTarget<TerminalEvents> = new EventTarget();
    private inputBuffer: string = "";

    private lines: string[] = [""]; // start with one empty line (cursor at row 0)
    private absoluteCursorRow: number = 0;
    private rewriteStart: number = 0;

    constructor() {
        process.stdin.setRawMode(true);
        process.stdin.on("data", (data: Buffer) => this.onData(data));
        process.stdout.on("resize", () => {
            this.emitter.dispatchEvent({
                type: "resize",
                columns: process.stdout.columns,
                rows: process.stdout.rows,
            });
        });
    }

    addEventListener<T extends keyof TerminalEvents & string>(
        type: T,
        listener: EventListener<TerminalEvents, T>,
    ) {
        this.emitter.addEventListener(type, listener);
    }

    removeEventListener<T extends keyof TerminalEvents & string>(
        type: T,
        listener: EventListener<TerminalEvents, T>,
    ) {
        this.emitter.removeEventListener(type, listener);
    }

    // ── Public API ───────────────────────────────────────────────────────

    /** Write text to the terminal. Tracks lines and cursor position. */
    write(text: string): void {
        process.stdout.write(text);
        const parts = text.split("\n");
        // First fragment extends the current (possibly incomplete) last line
        this.lines[this.lines.length - 1] += parts[0];
        // Remaining fragments start new lines
        for (let i = 1; i < parts.length; i++) {
            this.lines.push(parts[i]);
        }
        this.absoluteCursorRow += parts.length - 1;
    }

    /**
     * Mark the current position as the start of a rewritable section.
     * Call this before the first `rewrite()` of a new message.
     */
    resetRewrite(): void {
        this.rewriteStart = this.lines.length - 1;
    }

    /**
     * Replace the rewritable section (lines[rewriteStart..]) with `text`.
     *
     * Only the lines that actually changed are redrawn. For typical streaming
     * (appending tokens), this means writing 0-2 new lines with no cursor
     * movement — completely avoiding the "cursor can't go above row 1" bug.
     */
    rewrite(text: string): void {
        const newLines = text.split("\n");
        const oldLines = this.lines.slice(this.rewriteStart);

        // Find the first line that differs
        let firstDiff = 0;
        const minLen = Math.min(oldLines.length, newLines.length);
        while (firstDiff < minLen && oldLines[firstDiff] === newLines[firstDiff]) {
            firstDiff++;
        }

        // Nothing changed
        if (firstDiff === oldLines.length && firstDiff === newLines.length) return;

        const changeStartAbsolute = this.rewriteStart + firstDiff;
        const linesToWrite = newLines.slice(firstDiff);

        if (changeStartAbsolute <= this.absoluteCursorRow) {
            // Changed line is at or above cursor — move up, clear, rewrite
            const up = this.absoluteCursorRow - changeStartAbsolute;
            if (up > 0) process.stdout.write(`\x1b[${up}A`);
            process.stdout.write("\x1b[G");  // cursor to col 1
            process.stdout.write("\x1b[0J"); // clear to end of screen
            if (linesToWrite.length > 0) {
                process.stdout.write(linesToWrite.join("\n"));
            }
        } else {
            // All existing lines match — appending new lines past current cursor
            const newlineCount = changeStartAbsolute - this.absoluteCursorRow;
            process.stdout.write("\n".repeat(newlineCount));
            if (linesToWrite.length > 0) {
                process.stdout.write(linesToWrite.join("\n"));
            }
        }

        // Update tracked state
        this.lines.length = this.rewriteStart;
        this.lines.push(...newLines);
        this.absoluteCursorRow = this.rewriteStart + newLines.length - 1;
    }

    // ── Raw input handling ───────────────────────────────────────────────

    onData(data: Buffer) {
        const key = data.toString();
        if (key === "\x03") {
            process.exit(); // Ctrl+C
        } else if (key === "\r") {
            // Enter — submit input
            process.stdout.write("\n");
            this.lines.push("");
            this.absoluteCursorRow++;
            this.emitter.dispatchEvent({
                type: "inputSubmitted",
                input: this.inputBuffer.trim(),
            });
            this.inputBuffer = "";
        } else if (key === "\x7f") {
            // Backspace
            if (this.inputBuffer.length > 0) {
                this.inputBuffer = this.inputBuffer.slice(0, -1);
                process.stdout.write("\b \b");
            }
        } else {
            // Regular character — echo and buffer
            this.inputBuffer += key;
            process.stdout.write(key);
        }
    }
}
