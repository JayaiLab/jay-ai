import type { ToolResultContent, TextBlock, ImageBlock, DocumentBlock } from "@jay-ai/core";

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const gray   = (s: string) => `\x1b[90m${s}\x1b[0m`;


// ── Shared utilities ──────────────────────────────────────────────────────────

const OUTPUT_TRUNCATE_CHARS = 500;

function extractText(output: ToolResultContent): string {
    if (typeof output === "string") return output;
    return output.map((block) => {
        if ((block as TextBlock).type === "text") return (block as TextBlock).text;
        if ((block as ImageBlock).type === "image") {
            const src = (block as ImageBlock).source;
            return `[image: ${src.type === "base64" ? src.media_type : src.url}]`;
        }
        if ((block as DocumentBlock).type === "document") {
            const doc = block as DocumentBlock;
            return `[document: ${doc.filename ?? doc.source.media_type}]`;
        }
        return "[unknown block]";
    }).join("\n");
}

function renderOutput(output: ToolResultContent): string {
    let text = extractText(output);
    if (text.length > OUTPUT_TRUNCATE_CHARS) {
        const lines = text.split("\n");
        text = text.slice(0, OUTPUT_TRUNCATE_CHARS) + `\n... [truncated, ${lines.length} lines total]`;
    }
    const trimmed = text.trim();
    if (!trimmed) return "";
    const indented = trimmed.split("\n").map(l => `  ${dim("│")} ${gray(l)}`).join("\n");
    return indented + "\n";
}

function header(name: string, detail: string): string {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    return `\n  ${cyan("●")} ${bold(yellow(label))}  ${dim(detail)}\n`;
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface ToolRenderer {
    renderStart(input: Record<string, unknown>): string;
    renderEnd(output: ToolResultContent): string;
}

// ── Tool-specific renderers ───────────────────────────────────────────────────

class BashRenderer implements ToolRenderer {
    renderStart(input: Record<string, unknown>): string {
        const description = (input.description as string | undefined) ?? "";
        const command = String(input.command ?? "");
        const title = header("bash", description);
        const cmd = `  $ ${command}\n`;
        return title + cmd;
    }
    renderEnd(output: ToolResultContent): string {
        return renderOutput(output);
    }
}

class ReadRenderer implements ToolRenderer {
    renderStart(input: Record<string, unknown>): string {
        return header("read", String(input.path ?? ""));
    }
    renderEnd(output: ToolResultContent): string {
        return renderOutput(output);
    }
}

class WriteRenderer implements ToolRenderer {
    renderStart(input: Record<string, unknown>): string {
        return header("write", String(input.path ?? ""));
    }
    renderEnd(output: ToolResultContent): string {
        return renderOutput(output);
    }
}

class EditRenderer implements ToolRenderer {
    renderStart(input: Record<string, unknown>): string {
        const detail = (input.description as string | undefined) ?? String(input.path ?? "");
        return header("edit", detail);
    }
    renderEnd(output: ToolResultContent): string {
        return renderOutput(output);
    }
}

class GrepRenderer implements ToolRenderer {
    renderStart(input: Record<string, unknown>): string {
        const pattern = String(input.pattern ?? "");
        const inPath = input.path ? ` in ${input.path}` : "";
        return header("grep", `${pattern}${inPath}`);
    }
    renderEnd(output: ToolResultContent): string {
        return renderOutput(output);
    }
}

class DefaultToolRenderer implements ToolRenderer {
    constructor(private name: string) {}
    renderStart(input: Record<string, unknown>): string {
        const detail = (input.description as string | undefined) ?? "";
        return header(this.name, detail);
    }
    renderEnd(output: ToolResultContent): string {
        return renderOutput(output);
    }
}

// ── Registry ──────────────────────────────────────────────────────────────────

const RENDERERS: ReadonlyMap<string, ToolRenderer> = new Map([
    ["bash",  new BashRenderer()],
    ["read",  new ReadRenderer()],
    ["write", new WriteRenderer()],
    ["edit",  new EditRenderer()],
    ["grep",  new GrepRenderer()],
]);

export class ToolRendererRegistry {
    get(toolName: string): ToolRenderer {
        return RENDERERS.get(toolName) ?? new DefaultToolRenderer(toolName);
    }
}
