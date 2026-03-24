import { Agent, AgentTool } from "@jay-ai/agent";
import { Type, type Static } from "@sinclair/typebox";
import { Terminal, renderAssistantMessage } from "@jay-ai/tui";
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

const WeatherInput = Type.Object({
    city: Type.String({ description: "The city name." }),
});

type WeatherInput = Static<typeof WeatherInput>;

const weatherTool: AgentTool<WeatherInput> = {
    name: "get_weather",
    description: "Get the current weather for a city.",
    input_schema: WeatherInput,
    func: (input) => {
        if (input.city === "New York") return "rainy, 50°F";
        if (input.city === "San Francisco") return "sunny, 60°F";
        return "sunny, 70°F";
    },
};

export class ChatMode {
    private terminal: Terminal;
    private agent: Agent;
    private renderers = new ToolRendererRegistry();
    private streamingSnapshot: ReturnType<typeof renderAssistantMessage> | null = null;

    constructor() {
        this.terminal = new Terminal();
        this.agent = new Agent({
            model: "claude-sonnet-4-6",
            modelProvider: "anthropic",
            ...resolveAuth(),
            system: systemPrompt,
            max_tokens: 16000,
            thinking: { effort: "high" },
        }, [weatherTool, readTool, bashTool, writeTool, editTool, grepTool]);

        this.terminal.addEventListener("resize", () => {
            if (this.streamingSnapshot !== null) {
                this.terminal.write("\n");
                this.terminal.resetRewrite();
                this.terminal.rewrite(this.streamingSnapshot);
            }
        });

        this.terminal.addEventListener("inputSubmitted", (event) => {
            void this.handleInput(event.input);
        });
    }

    start(): void {
        const authSource = loadAuth()?.provider === "anthropic" ? "OAuth token" : "API key";
        this.terminal.write(`Welcome to Jay AI (Anthropic · ${authSource}). Type a message to get started.\n\n`);
    }

    private async handleInput(input: string): Promise<void> {
        const stream = this.agent.run(input);
        for await (const event of stream) {
            switch (event.type) {
                case "message_start":
                    this.terminal.resetRewrite();
                    break;
                case "message_update":
                    this.streamingSnapshot = renderAssistantMessage(event.streamEvent.snapshot);
                    this.terminal.rewrite(this.streamingSnapshot);
                    break;
                case "tool_execution_start":
                    this.terminal.write(this.renderers.get(event.name).renderStart(event.input));
                    break;
                case "tool_execution_end":
                    this.terminal.write(this.renderers.get(event.name).renderEnd(event.output));
                    break;
            }
        }
        this.streamingSnapshot = null;
        this.terminal.write("\n");
    }
}
