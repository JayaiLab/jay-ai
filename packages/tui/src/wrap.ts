import stringWidth from "string-width";

/** Visible width of a string, stripping ANSI escapes and accounting for wide chars. */
export function visibleWidth(str: string): number {
    return stringWidth(str);
}

/**
 * Split a string into physical terminal rows.
 * Splits on \n first, then wraps any line exceeding `width` visible columns.
 * ANSI escape sequences are not counted toward visible width and are never split.
 * Wide characters (CJK, emoji) are counted as 2 columns.
 */
export function wrapLines(text: string, width: number): string[] {
    const rows: string[] = [];
    for (const line of text.split("\n")) {
        if (line === "") {
            rows.push("");
            continue;
        }
        rows.push(...wrapLine(line, width));
    }
    return rows;
}

/**
 * Wrap a single line (no \n) into rows of at most `width` visible columns.
 * Walks the string token by token (ANSI sequences or single characters),
 * measuring character width with string-width.
 */
function wrapLine(line: string, width: number): string[] {
    if (width <= 0) return [line];

    const rows: string[] = [];
    let currentRow = "";
    let currentWidth = 0;
    let i = 0;

    while (i < line.length) {
        // Check for ANSI CSI escape: \x1b[ ... <letter>
        if (line[i] === "\x1b" && i + 1 < line.length && line[i + 1] === "[") {
            const match = line.slice(i).match(/^\x1b\[[0-9;]*[a-zA-Z]/);
            if (match) {
                currentRow += match[0];
                i += match[0].length;
                continue;
            }
        }

        // Check for ANSI APC escape: \x1b_ ... \x07
        if (line[i] === "\x1b" && i + 1 < line.length && line[i + 1] === "_") {
            const end = line.indexOf("\x07", i);
            if (end !== -1) {
                currentRow += line.slice(i, end + 1);
                i = end + 1;
                continue;
            }
        }

        // Check for other escape sequences: \x1b followed by next char
        if (line[i] === "\x1b") {
            currentRow += line[i];
            i++;
            continue;
        }

        // Regular visible character — extract full code point (handles emoji surrogate pairs)
        const codePoint = line.codePointAt(i)!;
        const char = String.fromCodePoint(codePoint);
        const charWidth = stringWidth(char);
        const charLen = char.length; // 2 for surrogate pairs, 1 otherwise

        // If this char would overflow, start a new row
        if (currentWidth + charWidth > width) {
            rows.push(currentRow);
            currentRow = "";
            currentWidth = 0;
        }

        currentRow += char;
        currentWidth += charWidth;
        i += charLen;
    }

    // Push the last row
    if (currentRow.length > 0 || rows.length === 0) {
        rows.push(currentRow);
    }

    return rows;
}
