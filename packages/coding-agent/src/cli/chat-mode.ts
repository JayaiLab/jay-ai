import { Agent, ModelProvider } from "@jay-ai/agent";
import {
    Terminal, Container,
    UserMessageComponent, AssistantMessageComponent,
    ToolExecutionComponent, PromptComponent, WelcomeComponent,
    SelectComponent, CommandExecutionComponent, InputComponent, FooterComponent, LoaderComponent,
    debugLog, enableDebugLog,
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
import { getAuthenticatedModels } from "./models";
import { anthropicOAuthProvider, openaiCodexOAuthProvider } from "@jay-ai/core";
import type { Transport } from "@jay-ai/core";
import type { OAuthProviderInterface } from "@jay-ai/core";
import fs from "fs";

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
    modelProvider: ModelProvider;
    apiKey?: string;
    authToken?: string;
    transport?: Transport;
    sessionId?: string;
};

/** Map model provider to OAuth provider ID. */
export function resolveAuth(): ResolvedAuth | null {
    const settings = loadSettings();
    if (!settings.model || !settings.modelProvider) return null;

    const auth = loadAuth(settings.modelProvider);
    if (!auth) return null;

    return {
        model: settings.model,
        modelProvider: settings.modelProvider,
        authToken: auth.credentials.access,
        transport: settings.transport,
    };
}

function generateSessionId(): string {
    return crypto.randomUUID();
}
export class ChatMode {
    private terminal: Terminal;
    private agent: Agent;
    private renderers = new ToolRendererRegistry();
    private conversation: Container = new Container([]);
    private prompt: PromptComponent;
    private root: Container;
    private currentMessage: AssistantMessageComponent | null = null;
    private loader: LoaderComponent;
    private footer: FooterComponent;
    private debugMode: boolean;
    private debugConfig: DebugConfig;
    private readonly sessionId: string;

    constructor(auth: ResolvedAuth, debugMode: boolean = false, debugConfig?: DebugConfig) {
        this.debugMode = debugMode;
        this.debugConfig = debugConfig || {};
        if (this.debugConfig.tuiDebug) enableDebugLog();
        this.sessionId = auth.sessionId ?? generateSessionId();
        this.terminal = new Terminal();
        this.terminal.clearScreen();
        this.agent = new Agent({
            ...auth,
            sessionId: this.sessionId,
            system: systemPrompt,
            max_tokens: 16000,
            thinking: { effort: "high" },
        }, [readTool, bashTool, writeTool, editTool, grepTool]);

        this.prompt = new PromptComponent((input) => {
            void this.handleInput(input);
        });
        this.loader = new LoaderComponent(() => this.render());

        const authSource = `${auth.modelProvider} · ${auth.model}`;
        const welcome = new WelcomeComponent(`Welcome to Jay AI (${authSource}). Type a message to get started.\n`);
        if (this.debugMode && this.debugConfig.stepThrough) {
            welcome.setSuffix(() => `debug mode on. Press 'k' to continue.\n`);
        }

        this.footer = new FooterComponent();
        const newlineKey = process.platform === "darwin" ? "Option+Enter" : "Alt+Enter";
        this.footer.setText(`${authSource}  ·  ${newlineKey} for newline`);

        this.root = new Container([
            welcome,
            this.conversation,
            this.loader,
            this.prompt,
            this.footer,
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
            case "/transport":
                await this.handleTransportCommand();
                break;
            default:
                this.conversation.addChild(new ErrorMessageComponent(`Unknown command: ${command}`));
                this.prompt.setEnabled(true);
                this.render();
        }
    }

    private async handleLoginCommand(): Promise<void> {
        this.prompt.setEnabled(false);

        const PROVIDERS: OAuthProviderInterface[] = [anthropicOAuthProvider, openaiCodexOAuthProvider];
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

        const inputComponent = new InputComponent("> ");
        const authComponent = new CommandExecutionComponent("");
        try {
            const credentials = await provider.login({
                onAuth: ({ url }) => {
                    cmdComponent.setVisible(false);
                    this.conversation.addChild(authComponent);
                    authComponent.addLine("");
                    authComponent.addLine("Open this URL in your browser:");
                    authComponent.addLine(`  ${url}`);
                    authComponent.addLine("");
                    authComponent.addLine("After authorizing, paste the code below:");
                    authComponent.addChild(inputComponent);
                    this.terminal.setDataHandler((key) => {
                        inputComponent.handleKey(key);
                        this.render();
                    });
                    this.render();
                },
                onPrompt: () => inputComponent.waitForInput(),
            });

            authComponent.removeChild(inputComponent);
            await saveAuth({ provider: provider.id, credentials });
            const newAuth = resolveAuth();
            if (newAuth) {
                this.agent = new Agent({
                    ...newAuth,
                    sessionId: this.sessionId,
                    system: systemPrompt,
                    max_tokens: 16000,
                    thinking: { effort: "high" },
                }, [readTool, bashTool, writeTool, editTool, grepTool]);
                this.footer.setText(`${newAuth.modelProvider} · ${newAuth.model}`);
            }
            authComponent.addLine("");
            authComponent.addLine(`Credentials saved to ~/.jayai/auth.json`);
            authComponent.addLine(`Access token expires at ${new Date(credentials.expires).toLocaleString()}`);
        } catch (err) {
            authComponent.removeChild(inputComponent);
            authComponent.addLine("");
            authComponent.addLine(`\x1b[31mLogin failed: ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
        }

        this.prompt.setEnabled(true);
        this.restoreDataHandler();
        this.render();
    }

    private async handleModelCommand(): Promise<void> {
        this.prompt.setEnabled(false);

        const cmdComponent = new CommandExecutionComponent("/model");
        this.conversation.addChild(cmdComponent);

        const availableModels = getAuthenticatedModels();
        if (availableModels.length === 0) {
            cmdComponent.addLine("No authenticated providers. Run /login first.");
            this.prompt.setEnabled(true);
            this.restoreDataHandler();
            this.render();
            return;
        }

        const modelSelect = new SelectComponent(
            "Select a model:",
            availableModels.map(m => ({
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
        const chosen = availableModels[modelIndex];
        saveSettings({ ...loadSettings(), model: chosen.id, modelProvider: chosen.provider });

        cmdComponent.addLine("");
        cmdComponent.addLine(`Model set to ${chosen.id} (${chosen.provider})`);
        this.footer.setText(`${chosen.provider} · ${chosen.id}`);

        this.prompt.setEnabled(true);
        this.restoreDataHandler();
        this.render();
    }

    private async handleTransportCommand(): Promise<void> {
        this.prompt.setEnabled(false);

        const cmdComponent = new CommandExecutionComponent("/transport");
        this.conversation.addChild(cmdComponent);

        const transports: Transport[] = ["websocket", "sse"];
        const transportSelect = new SelectComponent(
            "Select a transport:",
            transports.map(t => ({
                label: t,
                description: t === "websocket" ? "Use WebSocket streaming" : "Use server-sent events",
            })),
        );
        cmdComponent.addChild(transportSelect);
        this.terminal.setDataHandler((key) => {
            transportSelect.handleKey(key);
            this.render();
        });
        this.render();

        const transportIndex = await transportSelect.waitForSelection();
        const chosen = transports[transportIndex];
        saveSettings({ ...loadSettings(), transport: chosen });

        cmdComponent.addLine("");
        cmdComponent.addLine(`Transport set to ${chosen}`);

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
            logPath = `/tmp/AGENT_STREAM_${Date.now()}.jsonl`;
            fs.writeFileSync(logPath, "");
        }

        try {
            const stream = this.agent.run(input);
            for await (const event of stream) {
                if (logPath) fs.appendFileSync(logPath, JSON.stringify(event) + "\n");
                if (this.debugConfig.tuiDebug) debugLog("stream event", event);

                switch (event.type) {
                    case "message_start":
                        this.loader.start();
                        this.currentMessage = new AssistantMessageComponent();
                        this.conversation.addChild(this.currentMessage);
                        break;
                    case "message_update":
                        this.currentMessage!.update(event.streamEvent.snapshot);
                        break;
                    case "message_end":
                        this.loader.stop();
                        this.currentMessage = null;
                        break;
                    case "tool_execution_start": {
                        this.loader.start();
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
                        this.loader.stop();
                        const message = formatProviderError(event.error);
                        this.conversation.addChild(new ErrorMessageComponent(message));
                        break;
                    }
                }
                this.render();
                if (this.debugConfig.stepThrough) await this.terminal.waitForKey("k");
            }
        } catch (err) {
            this.loader.stop();
            const message = formatProviderError(err);
            this.conversation.addChild(new ErrorMessageComponent(message));
            this.render();
        }

        this.prompt.setEnabled(true);
        this.terminal.render(this.root);
    }
}
