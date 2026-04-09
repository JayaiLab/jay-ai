import { Component } from "../compotent";

/**
 * A component for displaying command output within the component tree.
 * Used when running commands like /login, /model from chat mode.
 * Holds a list of text lines and optional child components.
 */
export class CommandExecutionComponent implements Component {
    private lines: string[] = [];
    private children: Component[] = [];

    constructor(private title: string) {}

    addLine(line: string): void {
        this.lines.push(line);
    }

    addChild(child: Component): void {
        this.children.push(child);
    }

    render(width: number): string[] {
        const rows: string[] = [];
        rows.push(`\x1b[33m${this.title}\x1b[0m`);
        rows.push(...this.lines);
        for (const child of this.children) {
            rows.push(...child.render(width));
        }
        return rows;
    }
}
