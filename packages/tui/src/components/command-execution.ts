import { Component } from "../compotent";
import { wrapLines } from "../wrap";

/**
 * A component for displaying command output within the component tree.
 * Used when running commands like /login, /model from chat mode.
 * Holds a list of text lines and optional child components.
 */
export class CommandExecutionComponent implements Component {
    private lines: string[] = [];
    private children: Component[] = [];
    private visible: boolean = true;

    constructor(private title: string) {}

    setVisible(visible: boolean): void {
        this.visible = visible;
    }

    addLine(line: string): void {
        this.lines.push(line);
    }

    addChild(child: Component): void {
        this.children.push(child);
    }

    removeChild(child: Component): void {
        const index = this.children.indexOf(child);
        if (index !== -1) this.children.splice(index, 1);
    }

    render(width: number): string[] {
        if (!this.visible) return [];
        const rows: string[] = [];
        if (this.title) {
            rows.push(`\x1b[33m${this.title}\x1b[0m`);
        }
        for (const line of this.lines) {
            rows.push(...wrapLines(line, width));
        }
        for (const child of this.children) {
            rows.push(...child.render(width));
        }
        return rows;
    }
}
