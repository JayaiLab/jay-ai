import { AssistantMessage } from "@jay-ai/core";
import { Component } from "../compotent";
import { renderAssistantMessage } from "../markdown";

export class AssistantMessageComponent implements Component {
    private message: AssistantMessage | null = null;

    update(message: AssistantMessage): void {
        this.message = message;
    }

    render(): string {
        if (!this.message) return "";
        return renderAssistantMessage(this.message);
    }
}
