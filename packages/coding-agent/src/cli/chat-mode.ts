import { Agent } from "@jay-ai/agent";
import {
    Terminal, Container,
    UserMessageComponent, AssistantMessageComponent,
    ToolExecutionComponent, PromptComponent, WelcomeComponent,
    SelectComponent, CommandExecutionComponent, InputComponent,
    debugLog,
} from "@jay-ai/tui";
import readTool from "../tools/read";
import bashTool from "../tools/bash";
import writeTool from "../tools/write";
import editTool from "../tools/edit";
import grepTool from "../tools/grep";
import { systemPrompt } from "../system-prompt";
import { loadAuth, saveAuth } from "../auth";
import { loadSettings, saveSettings } from "../settings";
import { ToolRendererRegistry } from "./tool-renderers";
import { ALL_MODELS } from "./models";
import { anthropicOAuthProvider } from "@jay-ai/core";
import type { OAuthProviderInterface } from "@jay-ai/core";
import fs from "fs";
import { mockStream } from "../../test/mock-stream";

export type DebugConfig = {
    stepThrough?: boolean;   // pause after each event, press 'k' to continue
    captureAgentStream?: boolean;     // save each turn of an agent run to AGENT_STREAM_<timestamp>.jsonl
    tuiDebug?: boolean;    // emit debug logs to /tmp/jayai-debug.log in real time
};

class ErrorMessageComponent {
    constructor(private message: string) { }
    render(_width: number): string[] {
        return [`\x1b[31mError: ${this.message}\x1b[0m`];
    }
}

function formatProviderError(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "object" && err !== null) {
        // Handle raw Anthropic error objects if they aren't Error instances
        const anyErr = err as any;
        if (anyErr.error?.error?.message) return anyErr.error.error.message;
        if (anyErr.error?.message) return anyErr.error.message;
        if (anyErr.message) return anyErr.message;
        try { return JSON.stringify(err); } catch { return String(err); }
    }
    return String(err);
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
                await this.handleLoginCommand();
                break;
            case "/model":
                await this.handleModelCommand();
                break;
            default:
                this.conversation.addChild(new ErrorMessageComponent(`Unknown command: ${command}`));
                this.prompt.setEnabled(true);
                this.render();
        }
    }

    private async handleLoginCommand(): Promise<void> {
        this.prompt.setEnabled(false);

        const PROVIDERS: OAuthProviderInterface[] = [anthropicOAuthProvider];
        const cmdComponent = new CommandExecutionComponent("/login");
        this.conversation.addChild(cmdComponent);

        // Step 1: Select provider
        const providerSelect = new SelectComponent(
            "Select an OAuth provider:",
            PROVIDERS.map(p => ({ label: p.name })),
        );
        cmdComponent.addChild(providerSelect);
        this.terminal.setDataHandler((key) => {
            providerSelect.handleKey(key);
            this.render();
        });
        this.render();

        const providerIndex = await providerSelect.waitForSelection();
        const provider = PROVIDERS[providerIndex];

        // Step 2: Start OAuth flow
        cmdComponent.addLine("");
        cmdComponent.addLine(`Logging in with ${provider.name}...`);
        this.render();

        try {
            const inputComponent = new InputComponent("> ");
            const credentials = await provider.login({
                onAuth: ({ url }) => {
                    cmdComponent.addLine("");
                    cmdComponent.addLine("Open this URL in your browser:");
                    cmdComponent.addLine(`  ${url}`);
                    cmdComponent.addLine("");
                    cmdComponent.addLine("After authorizing, paste the code below:");
                    cmdComponent.addChild(inputComponent);
                    this.terminal.setDataHandler((key) => {
                        inputComponent.handleKey(key);
                        this.render();
                    });
                    this.render();
                },
                onPrompt: () => inputComponent.waitForInput(),
            });

            await saveAuth({ provider: provider.id, credentials });
            cmdComponent.addLine("");
            cmdComponent.addLine(`Credentials saved to ~/.jayai/auth.json`);
            cmdComponent.addLine(`Access token expires at ${new Date(credentials.expires).toLocaleString()}`);
        } catch (err) {
            cmdComponent.addLine("");
            cmdComponent.addLine(`\x1b[31mLogin failed: ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
        }

        this.prompt.setEnabled(true);
        this.restoreDataHandler();
        this.render();
    }

    private async handleModelCommand(): Promise<void> {
        this.prompt.setEnabled(false);

        const cmdComponent = new CommandExecutionComponent("/model");
        this.conversation.addChild(cmdComponent);

        const modelSelect = new SelectComponent(
            "Select a model:",
            ALL_MODELS.map(m => ({
                label: m.id,
                description: `${m.description} (${m.provider})`,
            })),
        );
        cmdComponent.addChild(modelSelect);
        this.terminal.setDataHandler((key) => {
            modelSelect.handleKey(key);
            this.render();
        });
        this.render();

        const modelIndex = await modelSelect.waitForSelection();
        const chosen = ALL_MODELS[modelIndex];
        saveSettings({ ...loadSettings(), model: chosen.id, modelProvider: chosen.provider });

        cmdComponent.addLine("");
        cmdComponent.addLine(`Model set to ${chosen.id} (${chosen.provider})`);

        this.prompt.setEnabled(true);
        this.restoreDataHandler();
        this.render();
    }

    private async handleInput(input: string): Promise<void> {
        if (input.startsWith("/")) {
            void this.handleCommand(input.trim());
            return;
        }

        this.conversation.addChild(new UserMessageComponent(input));
        this.prompt.setEnabled(false);
        this.terminal.render(this.root);

        let logPath: string | null = null;
        if (this.debugMode && this.debugConfig.captureAgentStream) {
            logPath = `${import.meta.dirname}/../test/AGENT_STREAM_${Date.now()}.jsonl`;
            fs.writeFileSync(logPath, "");
        }

        try {
            const stream = this.agent.run(input);
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
                    case "error": {
                        const message = formatProviderError(event.error);
                        this.conversation.addChild(new ErrorMessageComponent(message));
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
