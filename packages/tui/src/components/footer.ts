import { Component } from "../compotent";
import { wrapLines } from "../wrap";

export class FooterComponent implements Component {
    private text: string = "";

    setText(text: string): void {
        this.text = text;
    }

    render(width: number): string[] {
        return wrapLines(this.text, width).map(line => `\x1b[90m${line}\x1b[0m`);
    }
}
