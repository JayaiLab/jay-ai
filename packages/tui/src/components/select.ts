import { Component } from "../compotent";

export interface SelectOption {
    label: string;
    description?: string;
}

/**
 * A select menu component that integrates with the component tree.
 * Unlike selectFromOptions (which writes directly to the terminal),
 * this component renders as part of the component tree and participates
 * in diff-based rendering.
 */
export class SelectComponent implements Component {
    private selected: number = 0;
    private resolved: boolean = false;
    private resolveCallback: ((index: number) => void) | null = null;
    private title: string;

    constructor(
        title: string,
        private readonly options: SelectOption[],
    ) {
        this.title = title;
    }

    /** Handle a key press. Returns true if the key was consumed. */
    handleKey(key: string): boolean {
        if (this.resolved) return false;

        if (key === "\x1b[A") { // up
            this.selected = (this.selected - 1 + this.options.length) % this.options.length;
            return true;
        } else if (key === "\x1b[B") { // down
            this.selected = (this.selected + 1) % this.options.length;
            return true;
        } else if (key === "\r") { // enter
            this.resolved = true;
            if (this.resolveCallback) {
                this.resolveCallback(this.selected);
            }
            return true;
        }
        return false;
    }

    /** Returns a promise that resolves with the selected index when the user presses Enter. */
    waitForSelection(): Promise<number> {
        if (this.resolved) {
            return Promise.resolve(this.selected);
        }
        return new Promise((resolve) => {
            this.resolveCallback = resolve;
        });
    }

    render(_width: number): string[] {
        const lines: string[] = [];
        lines.push(this.title);
        if (!this.resolved) {
            lines.push("Use ↑↓ to navigate, Enter to confirm:");
        }
        lines.push("");
        for (let i = 0; i < this.options.length; i++) {
            const o = this.options[i];
            const cursor = i === this.selected ? "> " : "  ";
            const desc = o.description ? `  ${o.description}` : "";
            const color = i === this.selected ? "\x1b[34m" : "\x1b[90m";
            if (this.resolved && i !== this.selected) continue;
            lines.push(`${color}${cursor}${o.label}${desc}\x1b[0m`);
        }
        return lines;
    }
}
