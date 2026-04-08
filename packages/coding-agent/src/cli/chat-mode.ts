import { Agent } from "@jay-ai/agent";
import {
    Terminal, Container,
    UserMessageComponent, AssistantMessageComponent,
    ToolExecutionComponent, PromptComponent, WelcomeComponent,
    debugLog,
} from "@jay-ai/tui";
import readTool from "../tools/read";
import bashTool from "../tools/bash";
import writeTool from "../tools/write";
import editTool from "../tools/edit";
import grepTool from "../tools/grep";
import { systemPrompt } from "../system-prompt";
import { loadAuth } from "../auth";
import { runLogin } from "../login";
import { loadSettings } from "../settings";
import { ToolRendererRegistry } from "./tool-renderers";
import fs from "fs";
import { mockStream } from "../../test/mock-stream";

export type DebugConfig = {
    stepThrough?: boolean;   // pause after each event, press 'k' to continue
    captureAgentStream?: boolean;     // save each turn of an agent run to AGENT_STREAM_<timestamp>.jsonl
    tuiDebug?: boolean;    // emit debug logs to /tmp/jayai-debug.log in real time
};

class ErrorMessageComponent {
    constructor(private message: string) {}
    render(_width: number): string[] {
        return [`\x1b[31mError: ${this.message}\x1b[0m`];
    }
}

function formatProviderError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

type ResolvedAuth = {
    model: string;
    modelProvider: "anthropic" | "openai";
    apiKey?: string;
    authToken?: string;
};

export function resolveAuth(): ResolvedAuth | null {
    const auth = loadAuth();
    if (!auth?.provider || !auth.credentials.access) return null;

    const settings = loadSettings();
    if (!settings.model || !settings.modelProvider) return null;

    return {
        model: settings.model,
        modelProvider: settings.modelProvider as "anthropic" | "openai",
        authToken: auth.credentials.access,
    };
}

export class ChatMode {
    private terminal: Terminal;
    private agent: Agent;
    private renderers = new ToolRendererRegistry();
    private conversation: Container = new Container([]);
    private prompt: PromptComponent;
    private root: Container;
    private currentMessage: AssistantMessageComponent | null = null;
    private debugMode: boolean;
    private debugConfig: DebugConfig;

    constructor(auth: ResolvedAuth, debugMode: boolean = false, debugConfig?: DebugConfig) {
        this.debugMode = debugMode;
        this.debugConfig = debugConfig || {};
        this.terminal = new Terminal();
        this.terminal.clearScreen();
        this.agent = new Agent({
            ...auth,
            system: systemPrompt,
            max_tokens: 16000,
            thinking: { effort: "high" },
        }, [readTool, bashTool, writeTool, editTool, grepTool]);

        this.prompt = new PromptComponent((input) => {
            void this.handleInput(input);
        });

        const authSource = `${auth.modelProvider} · ${auth.model}`;
        const welcome = new WelcomeComponent(`Welcome to Jay AI (${authSource}). Type a message to get started.\n`);
        if (this.debugMode && this.debugConfig.stepThrough) {
            welcome.setSuffix(() => `debug mode on. Press 'k' to continue.\n`);
        }

        this.root = new Container([
            welcome,
            this.conversation,
            this.prompt
        ]);

        this.restoreDataHandler();

        this.terminal.addEventListener("resize", () => {
            this.render();
        });
    }

    start(): void {
        this.render();
    }

    private render(): void {
        this.terminal.render(this.root);
    }

    private restoreDataHandler(): void {
        this.terminal.setDataHandler((key) => {
            this.prompt.handleKey(key);
            this.render();
        });
    }

    private async handleCommand(command: string): Promise<void> {
        switch (command) {
            case "/login":
                this.prompt.setEnabled(false);
                this.terminal.render(this.root);
                await runLogin(this.terminal);
                this.restoreDataHandler();
                this.terminal.clearScreen();
                this.prompt.setEnabled(true);
                this.render();
                break;
            default:
                this.conversation.addChild(new ErrorMessageComponent(`Unknown command: ${command}`));
                this.prompt.setEnabled(true);
                this.render();
        }
    }

    private async handleInput(input: string): Promise<void> {
        if (input.startsWith("/")) {
            void this.handleCommand(input.trim());
            return;
        }

        this.conversation.addChild(new UserMessageComponent(input));
        this.prompt.setEnabled(false);
        this.terminal.render(this.root);

        const stream = this.agent.run(input);
        // const stream = mockStream();

        let logPath: string | null = null;
        if (this.debugMode && this.debugConfig.captureAgentStream) {
            logPath = `${import.meta.dirname}/../test/AGENT_STREAM_${Date.now()}.jsonl`;
            fs.writeFileSync(logPath, "");
        }

        try {
            for await (const event of stream) {
                if (logPath) fs.appendFileSync(logPath, JSON.stringify(event) + "\n");
                if (this.debugConfig.tuiDebug) debugLog("stream event", event);

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
                if (this.debugConfig.stepThrough) await this.terminal.waitForKey("k");
            }
        } catch (err) {
            const message = formatProviderError(err);
            this.conversation.addChild(new ErrorMessageComponent(message));
            this.render();
        }

        this.prompt.setEnabled(true);
        this.terminal.render(this.root);
    }
}
