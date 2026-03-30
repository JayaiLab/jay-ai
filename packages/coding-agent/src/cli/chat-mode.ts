import { Agent, AgentTool } from "@jay-ai/agent";
import { Type, type Static } from "@sinclair/typebox";
import {
    Terminal, Container,
    UserMessageComponent, AssistantMessageComponent,
    ToolExecutionComponent, PromptComponent, WelcomeComponent,
} from "@jay-ai/tui";
import readTool from "../tools/read";
import bashTool from "../tools/bash";
import writeTool from "../tools/write";
import editTool from "../tools/edit";
import grepTool from "../tools/grep";
import { systemPrompt } from "../system-prompt";
import { loadAuth } from "../auth";
import { ToolRendererRegistry } from "./tool-renderers";

function resolveAuth(): { apiKey?: string; authToken?: string } {
    const auth = loadAuth();
    if (auth?.provider === "anthropic" && auth.credentials.access) {
        return { authToken: auth.credentials.access };
    }
    return { apiKey: process.env.ANTHROPIC_API_KEY };
}

export class ChatMode {
    private terminal: Terminal;
    private agent: Agent;
    private renderers = new ToolRendererRegistry();
    private conversation: Container = new Container([]);
    private prompt: PromptComponent;
    private root: Container;
    private currentMessage: AssistantMessageComponent | null = null;
    private debugMode: boolean = false;
    private renderCount: number = 0;

    constructor(debugMode: boolean = false) {
        this.debugMode = debugMode;
        this.terminal = new Terminal();
        this.agent = new Agent({
            model: "claude-sonnet-4-6",
            modelProvider: "anthropic",
            ...resolveAuth(),
            system: systemPrompt,
            max_tokens: 16000,
            thinking: { effort: "high" },
        }, [readTool, bashTool, writeTool, editTool, grepTool]);

        this.prompt = new PromptComponent((input) => {
            void this.handleInput(input);
        });

        const authSource = loadAuth()?.provider === "anthropic" ? "OAuth token" : "API key";
        const welcome = new WelcomeComponent(`Welcome to Jay AI (Anthropic · ${authSource}). Type a message to get started.\n`);
        // if (this.debugMode) {
        //     welcome.setSuffix(() => `[rendered: ${this.renderCount}]\n`);
        // }

        this.root = new Container([welcome, this.conversation, this.prompt]);

        this.terminal.setDataHandler((key) => {
            this.prompt.handleKey(key);
            this.render();
        });

        this.terminal.addEventListener("resize", () => {
            this.render();
        });
    }

    start(): void {
        this.render();
    }

    private render(): void {
        this.renderCount++;
        this.terminal.render(this.root);
    }

    private async handleInput(input: string): Promise<void> {
        this.conversation.addChild(new UserMessageComponent(input));
        this.prompt.setEnabled(false);
        this.terminal.render(this.root);

        const stream = this.agent.run(input);
        for await (const event of stream) {
            switch (event.type) {
                case "message_start":
                    this.currentMessage = new AssistantMessageComponent();
                    this.conversation.addChild(this.currentMessage);
                    break;
                case "message_update":
                    this.currentMessage!.update(event.streamEvent.snapshot);
                    break;
                case "message_end":
                    this.currentMessage = null;
                    break;
                case "tool_execution_start": {
                    const renderer = this.renderers.get(event.name);
                    const tool = new ToolExecutionComponent(renderer.renderStart(event.input));
                    this.conversation.addChild(tool);
                    break;
                }
                case "tool_execution_end": {
                    const last = this.conversation.children[this.conversation.children.length - 1];
                    if (last instanceof ToolExecutionComponent) {
                        const renderer = this.renderers.get(event.name);
                        last.setEndText(renderer.renderEnd(event.output));
                    }
                    break;
                }
            }
            this.render();
        }

        this.prompt.setEnabled(true);
        this.terminal.render(this.root);
    }
}
