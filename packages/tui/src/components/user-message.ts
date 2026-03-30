import { Component } from "../compotent";

export class UserMessageComponent implements Component {
    constructor(private readonly input: string) { }

    render(): string {
        const width = process.stdout.columns ?? 80;
        const text = `> ${this.input}`;
        const padded = text + " ".repeat(Math.max(0, width - text.length));
        return `\x1b[102m\x1b[30m${padded}\x1b[0m`;
    }
}
