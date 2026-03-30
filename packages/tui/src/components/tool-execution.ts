import { Component } from "../compotent";

export class ToolExecutionComponent implements Component {
    private endText: string = "";

    constructor(private readonly startText: string) { }

    setEndText(endText: string): void {
        this.endText = endText;
    }

    render(): string {
        return this.startText + this.endText;
    }
}
