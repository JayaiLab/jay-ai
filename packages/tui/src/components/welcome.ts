import { Component } from "../compotent";
import { wrapLines } from "../wrap";

export class WelcomeComponent implements Component {
    private suffix: (() => string) | null = null;

    constructor(private readonly message: string) {}

    setSuffix(suffix: () => string): void {
        this.suffix = suffix;
    }

    render(width: number): string[] {
        const text = this.suffix ? this.message + this.suffix() : this.message;
        return wrapLines(text.trimEnd(), width);
    }
}
