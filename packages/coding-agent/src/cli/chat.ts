import { Agent, AgentTool } from "@jay-ai/agent";
import type { ToolResultContent, TextBlock, ImageBlock, DocumentBlock } from "@jay-ai/core";
import { Type, type Static } from "@sinclair/typebox";
import { Terminal, createMarkdownRenderer } from "@jay-ai/tui";
import readTool from "../tools/read";
import bashTool from "../tools/bash";
import writeTool from "../tools/write";
import editTool from "../tools/edit";
import grepTool from "../tools/grep";
import { systemPrompt } from "../system-prompt";
import { loadAuth } from "../auth";

const OUTPUT_TRUNCATE_CHARS = 500;

function renderToolOutput(output: ToolResultContent): string {
    if (typeof output === "string") {
        if (output.length <= OUTPUT_TRUNCATE_CHARS) return output;
        const lines = output.split("\n");
        return output.slice(0, OUTPUT_TRUNCATE_CHARS) + `\n... [truncated, ${lines.length} lines total]`;
    }
    return output.map((block) => {
        if ((block as TextBlock).type === "text") {
            const text = (block as TextBlock).text;
            if (text.length <= OUTPUT_TRUNCATE_CHARS) return text;
            const lines = text.split("\n");
            return text.slice(0, OUTPUT_TRUNCATE_CHARS) + `\n... [truncated, ${lines.length} lines total]`;
        }
        if ((block as ImageBlock).type === "image") {
            const src = (block as ImageBlock).source;
            return `[image: ${src.type === "base64" ? src.media_type : src.url}]`;
        }
        if ((block as DocumentBlock).type === "document") {
            const doc = block as DocumentBlock;
            return `[document: ${doc.filename ?? doc.source.media_type}]`;
        }
        return `[unknown block]`;
    }).join("\n");
}

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

export async function runChat(terminal: Terminal): Promise<void> {
    const renderMarkdown = createMarkdownRenderer(process.stdout.columns ?? 80);
    const agent = new Agent({
        model: "claude-sonnet-4-6",
        modelProvider: "anthropic",
        ...resolveAuth(),
        system: systemPrompt,
        max_tokens: 16000,
        thinking: {
            effort: "high",
        }
    }, [weatherTool, readTool, bashTool, writeTool, editTool, grepTool]);

    const authSource = loadAuth()?.provider === "anthropic" ? "OAuth token" : "API key";
    terminal.write(`Welcome to Jay AI (Anthropic · ${authSource}). Type a message to get started.\n\n`);

    terminal.addEventListener("inputSubmitted", async (event) => {
        let accumulated = "";
        const stream = agent.run(event.input);
        for await (const ev of stream) {
            if (ev.type === "message_update" && ev.assistantMessageEvent.type === "text_delta") {
                accumulated += ev.assistantMessageEvent.text;
                terminal.rewrite(renderMarkdown(accumulated));
            } else if (ev.type === "tool_execution_start") {
                terminal.resetRewrite();
                terminal.write(`\n${ev.name}${ev.description ? `: ${ev.description}` : ''}\n`);
                terminal.write(`\nINPUT: ${JSON.stringify(ev.input)}\n`);
            } else if (ev.type === "tool_execution_end") {
                terminal.write(`OUTPUT: ${renderToolOutput(ev.output)}\n`);
            }
        }
        terminal.resetRewrite();
        terminal.write("\n");
    });
}
