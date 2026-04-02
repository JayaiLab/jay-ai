import { Component } from "../compotent";
import { wrapLines } from "../wrap";

export class ToolExecutionComponent implements Component {
    private endText: string = "";

    constructor(private readonly startText: string) { }

    setEndText(endText: string): void {
        this.endText = endText;
    }

    render(width: number): string[] {
        return wrapLines((this.startText + this.endText).trimEnd(), width);
    }
}
