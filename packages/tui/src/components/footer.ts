import { Component } from "../compotent";

export class FooterComponent implements Component {
    private text: string = "";

    setText(text: string): void {
        this.text = text;
    }

    render(_width: number): string[] {
        return [`\x1b[90m${this.text}\x1b[0m`];
    }
}
