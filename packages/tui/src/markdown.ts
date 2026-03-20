import { Marked } from "marked";
import TerminalRenderer from "marked-terminal";

export function createMarkdownRenderer(width: number): (text: string) => string {
    const renderer = new TerminalRenderer({ width });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new Marked({ renderer: renderer as any });
    return function renderMarkdown(text: string): string {
        return instance.parse(text) as string;
    };
}
