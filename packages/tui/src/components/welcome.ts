import { Component } from "../compotent";

export class WelcomeComponent implements Component {
    private suffix: (() => string) | null = null;

    constructor(private readonly message: string) {}

    setSuffix(suffix: () => string): void {
        this.suffix = suffix;
    }

    render(): string {
        return this.suffix ? this.message + this.suffix() : this.message;
    }
}
