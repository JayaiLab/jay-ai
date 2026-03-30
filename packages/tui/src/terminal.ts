import { EventTarget, EventListener } from "./event-target";
import { Component } from "./compotent";
import { CURSOR_MARKER } from "./components/prompt";

/** Calculate visible width of a string, stripping ANSI escape sequences. */
function visibleWidth(str: string): number {
    return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b_.*?\x07/g, "").length;
}

export type TerminalEvents = {
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
 */
export class Terminal {
    private emitter: EventTarget<TerminalEvents> = new EventTarget();
    private dataHandler: (key: string) => void = this.defaultDataHandler;

    private lines: string[] = [""]; // start with one empty line (cursor at row 0)
    private absoluteCursorRow: number = 0;

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
        this.absoluteCursorRow = this.lines.length - 1;
    }

    /**
     * Replace the entire tracked content with `text`.
     *
     * Only the lines that actually changed are redrawn. For typical streaming
     * (appending tokens), this means writing 0-2 new lines with no cursor
     * movement — completely avoiding the "cursor can't go above row 1" bug.
     */
    rewrite(text: string): void {
        const newLines = text.split("\n");
        const oldLines = this.lines;

        // Find the first line that differs
        let firstDiff = 0;
        const minLen = Math.min(oldLines.length, newLines.length);
        while (firstDiff < minLen && oldLines[firstDiff] === newLines[firstDiff]) {
            firstDiff++;
        }

        // Nothing changed
        if (firstDiff === oldLines.length && firstDiff === newLines.length) return;

        const linesToWrite = newLines.slice(firstDiff);

        if (firstDiff <= this.absoluteCursorRow) {
            // Changed line is at or above cursor — move up, clear, rewrite
            const up = this.absoluteCursorRow - firstDiff;
            if (up > 0) process.stdout.write(`\x1b[${up}A`);
            process.stdout.write("\x1b[G");  // cursor to col 1
            process.stdout.write("\x1b[0J"); // clear to end of screen
            if (linesToWrite.length > 0) {
                process.stdout.write(linesToWrite.join("\n"));
            }
        } else {
            // All existing lines match — appending new lines past current cursor
            const newlineCount = firstDiff - this.absoluteCursorRow;
            process.stdout.write("\r\n".repeat(newlineCount));
            if (linesToWrite.length > 0) {
                process.stdout.write(linesToWrite.join("\n"));
            }
        }

        // Update tracked state
        this.lines = newLines;
        this.absoluteCursorRow = newLines.length - 1;
    }

    /** Render a component tree, diffing against the previous render. */
    render(component: Component): void {
        const text = component.render();
        const lines = text.split("\n");

        // Extract cursor marker before diffing/writing
        const cursorPos = this.extractCursorPosition(lines, process.stdout.rows);

        this.rewrite(lines.join("\n"));

        // Move hardware cursor to marker position
        if (cursorPos) {
            const cursorRowFromBottom = (this.lines.length - 1) - cursorPos.row;
            if (cursorRowFromBottom > 0) {
                process.stdout.write(`\x1b[${cursorRowFromBottom}A`);
            }
            process.stdout.write(`\x1b[${cursorPos.col + 1}G`);
            this.absoluteCursorRow = cursorPos.row;
        }
    }

    setDataHandler(handler: (key: string) => void): void {
        this.dataHandler = handler;
    }

    /**
     * Find and extract cursor position from rendered lines.
     * Searches for CURSOR_MARKER, calculates its position, and strips it from the output.
     * Only scans the bottom terminal height lines (visible viewport).
     */
    private extractCursorPosition(lines: string[], height: number): { row: number; col: number } | null {
        const viewportTop = Math.max(0, lines.length - height);
        for (let row = lines.length - 1; row >= viewportTop; row--) {
            const line = lines[row];
            const markerIndex = line.indexOf(CURSOR_MARKER);
            if (markerIndex !== -1) {
                const beforeMarker = line.slice(0, markerIndex);
                const col = visibleWidth(beforeMarker);
                lines[row] = line.slice(0, markerIndex) + line.slice(markerIndex + CURSOR_MARKER.length);
                return { row, col };
            }
        }
        return null;
    }

    // ── Raw input handling ───────────────────────────────────────────────

    private onData(data: Buffer) {
        const key = data.toString();
        if (key === "\x03") {
            process.exit(); // Ctrl+C
        }
        this.dataHandler(key);
    }

    private defaultDataHandler(key: string): void { }
}
