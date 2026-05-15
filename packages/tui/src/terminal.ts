import { EventTarget, EventListener } from "./event-target";
import { Component } from "./compotent";
import { CURSOR_MARKER } from "./components/prompt";
import { debugLog } from "./debug-log";
import { visibleWidth } from "./wrap";

export type TerminalEvents = {
    resize: { type: "resize", columns: number, rows: number };
};

/**
 * Terminal with incremental rewriting.
 *
 * Instead of re-rendering the entire assistant message and using cursor-up to
 * clear it (which fails when content scrolls past the terminal top), we track
 * every row ever written and diff against the previous render.
 *
 * Each element in lines[] is exactly one physical terminal row — components
 * are responsible for wrapping to the terminal width via render(width).
 *
 * Key state:
 *   lines[]           – every row written this session (one per physical row)
 *   absoluteCursorRow  – which row the cursor sits on (0-indexed from session start)
 */
export class Terminal {
    private emitter: EventTarget<TerminalEvents> = new EventTarget();
    private dataHandler: (key: string) => void = this.defaultDataHandler;

    private lines: string[] = [""]; // start with one empty row (cursor at row 0)
    private absoluteCursorRow: number = 0;
    private viewportTop: number = 0; // the row number of the top of the viewport
    private renderCount: number = 0;

    // Node.js might split a long paste into multiple data events, which triggeres onData multiple times, causing multiple re-render, so we have to buffer the paste and trigger onData once.
    private pasteBuffer: string | null = null;
    private static readonly PASTE_START = "\x1b[200~";
    private static readonly PASTE_END = "\x1b[201~";

    constructor() {
        process.stdin.setRawMode(true);
        process.stdout.write("\x1b[?2004h"); // enable bracketed paste mode
        process.stdin.on("data", (data: Buffer) => this.onData(data));
        process.stdout.on("resize", () => {
            this.emitter.dispatchEvent({
                type: "resize",
                columns: process.stdout.columns,
                rows: process.stdout.rows,
            });
        });

        const cleanup = () => {
            process.stdout.write("\x1b[?2004l"); // disable bracketed paste mode
            process.stdout.write("\x1b[?25h"); // restore cursor
        };
        process.on("exit", cleanup);
        process.on("SIGINT", () => { cleanup(); process.exit(); });
        process.on("SIGTERM", () => { cleanup(); process.exit(); });
    }
    clearScreen(): void {
        process.stdout.write("\x1b[H\x1b[2J"); // clear screen and move cursor to top left
        this.absoluteCursorRow = 0;
        this.viewportTop = 0;
        this.lines = [""];
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
    /** Write text to the terminal. Tracks rows and cursor position. */
    write(text: string): void {
        process.stdout.write(text);
        const parts = text.split("\n");
        // First fragment extends the current (possibly incomplete) last row
        this.lines[this.lines.length - 1] += parts[0];
        // Remaining fragments start new rows
        for (let i = 1; i < parts.length; i++) {
            this.lines.push(parts[i]);
        }
        this.absoluteCursorRow = this.lines.length - 1;
        this.viewportTop = Math.max(0, this.lines.length - process.stdout.rows);
    }

    private fullRender(rows: string[]): void {
        const text = rows.join("\n");
        // clear the screen AND scrollback buffer and then rewrite the rows
        process.stdout.write("\x1b[H\x1b[2J\x1b[3J"); // clear screen and scrollback buffer and move cursor to top left
        process.stdout.write(text);

        // recalculate the viewport top and absolute cursor row
        this.lines = rows;
        this.viewportTop = Math.max(0, this.lines.length - process.stdout.rows);
        this.absoluteCursorRow = this.lines.length - 1;
    }

    /**
     * Replace the entire tracked content with `newRows`.
     *
     * Only the rows that actually changed are redrawn. For typical streaming
     * (appending tokens), this means writing 0-2 new rows with no cursor
     * movement — completely avoiding the "cursor can't go above row 1" bug.
     */
    private rewrite(newRows: string[]): void {
        const oldRows = this.lines;
        const height = process.stdout.rows;

        // Step 1. Extract and strip the cursor marker BEFORE diffing,
        // so the diff compares apples-to-apples (oldRows is already stripped).
        const cursorPos = this.extractCursorPosition(newRows, height, true);

        // Find the first and last row that differs
        let firstDiffRow = -1;
        let lastDiffRow = -1;
        const maxLen = Math.max(oldRows.length, newRows.length);
        for (let i = 0; i < maxLen; i++) {
            const newRow = i < newRows.length ? newRows[i] : "";
            const oldRow = i < oldRows.length ? oldRows[i] : "";
            if (newRow != oldRow) {
                if (firstDiffRow < 0) {
                    firstDiffRow = i;
                }
                lastDiffRow = i
            }
        }

        debugLog("rewrite", { firstDiffRow, lastDiffRow, viewportTop: this.viewportTop, oldRows, newRows, cursorPos });

        // Nothing changed in text content — but cursor may have moved because user is pressing left/right arrow.
        if (firstDiffRow === -1 && lastDiffRow === -1) {
            if (cursorPos) {
                process.stdout.write("\x1b[?25h");
                this.positionHardwareCursor(cursorPos, newRows.length);
            } else {
                process.stdout.write("\x1b[?25l");
            }
            return;
        }

        // Step 2. Move cursor to where the firstDiffRow is. Rewrite rows from firstDiffRow to lastDiffRow.
        // The terminal is a window into a scrollback buffer. The buffer can have many rows, but the terminal only shows height rows at a time.
        // Note: the cursor physically cannot move past the bottom or the top row of the terminal.
        let buffer = "\x1b[?2026h"; // Begin synchronized output
        const distance = firstDiffRow - this.absoluteCursorRow;
        const diffRows = newRows.slice(firstDiffRow, lastDiffRow + 1);
        if (distance < 0) { // move cursor up
            if (firstDiffRow < this.viewportTop) {
                debugLog("fullRender", { newRowCount: newRows.length });
                this.fullRender(newRows);
                // After fullRender, the cursor is at the last row. Move it back to the prompt's input row.
                if (cursorPos) {
                    process.stdout.write("\x1b[?25h");
                    this.positionHardwareCursor(cursorPos, newRows.length);
                } else {
                    process.stdout.write("\x1b[?25l");
                }
                return;
            } else {
                buffer += `\x1b[${Math.abs(distance)}A`; // now cursor is at firstDiffRow
            }
            if (diffRows.length > 0) {
                buffer += diffRows.map(l => `\x1b[G\x1b[2K${l}`).join("\n");
            }
        } else { // move cursor down
            const viewportBottom = this.viewportTop + height - 1;
            if (firstDiffRow > viewportBottom) {
                buffer += "\r\n".repeat(firstDiffRow - viewportBottom);
            } else if (distance > 0) {
                buffer += `\x1b[${distance}B`; // now cursor is at firstDiffRow
            }
            if (diffRows.length > 0) {
                buffer += diffRows.map(l => `\x1b[G\x1b[2K${l}`).join("\n");
            }
        }
        // After writing diffRows, cursor is physically on this row:
        const finalCursorRow = diffRows.length > 0
            ? firstDiffRow + diffRows.length - 1
            : firstDiffRow;

        // If content is shrinking, clear old rows past end of new content.
        const lastNewRow = newRows.length - 1;
        if (oldRows.length > newRows.length) {
            const clearFromRow = newRows.length; // first row to clear
            if (clearFromRow > finalCursorRow) {
                buffer += `\x1b[${clearFromRow - finalCursorRow}B`;
            } else if (clearFromRow < finalCursorRow) {
                buffer += `\x1b[${finalCursorRow - clearFromRow}A`;
            }
            buffer += `\x1b[G\x1b[J`;
            buffer += `\x1b[1A`;
        }

        // Step 3. Write buffer to the terminal.
        buffer += "\x1b[?2026l"; // End synchronized output
        process.stdout.write(buffer);
        this.absoluteCursorRow = oldRows.length > newRows.length ? lastNewRow : finalCursorRow;

        // Update viewportTop: scrolling only moves the viewport down, never up.
        this.viewportTop = Math.max(this.viewportTop, this.absoluteCursorRow - height + 1);

        // Step 4. Move the cursor position back to the marked position.
        if (cursorPos) {
            process.stdout.write("\x1b[?25h"); // show cursor
            this.positionHardwareCursor(cursorPos, newRows.length);
        } else {
            process.stdout.write("\x1b[?25l"); // hide cursor
        }
        this.lines = newRows;
    }

    private positionHardwareCursor(cursorPos: { row: number; col: number } | null, totalRows: number): void {
        if (!cursorPos || totalRows <= 0) {
            return;
        }

        const targetRow = Math.max(0, Math.min(cursorPos.row, totalRows - 1));
        const targetCol = Math.max(0, cursorPos.col);

        const rowDelta = targetRow - this.absoluteCursorRow;
        let buffer = "";
        if (rowDelta > 0) {
            buffer += `\x1b[${rowDelta}B`;
        } else if (rowDelta < 0) {
            buffer += `\x1b[${-rowDelta}A`;
        }
        buffer += `\x1b[${targetCol + 1}G`;

        if (buffer) {
            process.stdout.write(buffer);
        }

        this.absoluteCursorRow = targetRow;
    }

    /** Render a component tree, diffing against the previous render. */
    render(component: Component): void {
        this.renderCount++;
        const renderNum = this.renderCount;
        const width = process.stdout.columns ?? 80;
        const height = process.stdout.rows ?? 24;
        const rows = component.render(width);
        process.nextTick(() => {
            this.rewrite(rows);
            debugLog(`render #${renderNum}`, { absoluteCursorRow: this.absoluteCursorRow, viewportTop: this.viewportTop, totalRowCount: this.lines.length, width, height });
        });
    }

    setDataHandler(handler: (key: string) => void): void {
        this.dataHandler = handler;
    }

    /** Wait for a specific key press, temporarily overriding the data handler. */
    waitForKey(key: string): Promise<void> {
        return new Promise((resolve) => {
            const prev = this.dataHandler;
            this.dataHandler = (k) => {
                if (k.toLowerCase() === key.toLowerCase()) {
                    this.dataHandler = prev;
                    resolve();
                }
            };
        });
    }

    /**
     * Find and extract cursor position from rendered rows.
     * Searches for CURSOR_MARKER, calculates its position, and strips it from the output.
     */
    private extractCursorPosition(rows: string[], height: number, stripMarker: boolean): { row: number; col: number } | null {
        const viewportTop = Math.max(0, rows.length - height);
        let cursorPos: { row: number; col: number } | null = null;
        // Scan ALL rows to strip markers, not just the viewport — unstripped
        // markers outside the viewport leak as visible "pi:c" text.
        for (let row = rows.length - 1; row >= 0; row--) {
            const line = rows[row];
            const markerIndex = line.indexOf(CURSOR_MARKER);
            if (markerIndex !== -1) {
                if (!cursorPos && row >= viewportTop) {
                    const beforeMarker = line.slice(0, markerIndex);
                    const col = visibleWidth(beforeMarker);
                    cursorPos = { row, col };
                }
                if (stripMarker) {
                    rows[row] = line.slice(0, markerIndex) + line.slice(markerIndex + CURSOR_MARKER.length);
                }
            }
        }
        return cursorPos;
    }

    // ── Raw input handling ───────────────────────────────────────────────


    private onData(data: Buffer) {
        const key = data.toString();

        // Buffering paste: accumulate chunks until we see the end marker
        if (this.pasteBuffer !== null) {
            const endIdx = key.indexOf(Terminal.PASTE_END);
            if (endIdx !== -1) {
                this.pasteBuffer += key.slice(0, endIdx);
                const pasted = this.pasteBuffer.replace(/\r\n?/g, "\n");
                this.pasteBuffer = null;
                this.dataHandler(pasted);
            } else {
                this.pasteBuffer += key;
            }
            return;
        }

        // Start of a paste
        const startIdx = key.indexOf(Terminal.PASTE_START);
        if (startIdx !== -1) {
            const afterStart = key.slice(startIdx + Terminal.PASTE_START.length);
            const endIdx = afterStart.indexOf(Terminal.PASTE_END);
            if (endIdx !== -1) {
                // Whole paste arrived in one chunk — flush immediately.
                const pasted = afterStart.slice(0, endIdx).replace(/\r\n?/g, "\n");
                this.dataHandler(pasted);
            } else {
                this.pasteBuffer = afterStart;
            }
            return;
        }

        this.dataHandler(key);
    }

    private defaultDataHandler(key: string): void {
        if (key === "\x03") process.exit(); // Ctrl+C fallback
    }
}
