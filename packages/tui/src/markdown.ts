import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { AssistantMessage } from "@jay-ai/core";

// Dim gray for thinking blocks
const THINKING_PREFIX = "\x1b[90m💭 Thinking\n\x1b[90m";
const THINKING_SUFFIX = "\x1b[0m";

let cachedWidth = -1;
let markedInstance: Marked;

function renderMarkdown(text: string): string {
    const width = process.stdout.columns ?? 80;
    if (width !== cachedWidth) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        markedInstance = new Marked().use(markedTerminal({ width }) as any);
        cachedWidth = width;
    }
    return markedInstance.parse(text) as string;
}

export function renderAssistantMessage(message: AssistantMessage): string {
    const parts: string[] = [];
    for (const block of message.content) {
        switch (block.type) {
            case "text":
                parts.push(renderMarkdown(block.text));
                break;
            case "thinking":
                parts.push(`${THINKING_PREFIX}${block.thinking}${THINKING_SUFFIX}\n`);
                break;
        }
    }
    return parts.join("");
}