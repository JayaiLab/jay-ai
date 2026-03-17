import { Agent, AgentTool } from "@jay-ai/agent";
import type { ToolResultContent, TextBlock, ImageBlock, DocumentBlock } from "@jay-ai/core";

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
import { Type, type Static } from "@sinclair/typebox";
import { Terminal } from "@jay-ai/tui";
import readTool from "./tools/read";
import bashTool from "./tools/bash";
import writeTool from "./tools/write";
import editTool from "./tools/edit";
import grepTool from "./tools/grep";
import { systemPrompt } from "./system-prompt";

try {
    process.loadEnvFile();
} catch {
    // .env not found, continue with existing environment
}

const terminal = new Terminal();

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

// const agent = new Agent({
//     model: "claude-sonnet-4-6",
//     modelProvider: "anthropic",
//     system: "You are a helpful assistant.",
//     max_tokens: 16000,
// }, [weatherTool]);
const agent = new Agent({
    model: "gpt-4o-mini",
    modelProvider: "openai",
    system: systemPrompt,
    max_tokens: 16000,
}, [weatherTool, readTool, bashTool, writeTool, editTool, grepTool]);

terminal.write("Welcome to Jay AI. Type a message to get started.\n\n");

terminal.addEventListener("inputSubmitted", async (event) => {
    const stream = agent.run(event.input);
    for await (const event of stream) {
        if (event.type === "text_delta") {
            terminal.write(event.text);
        } else if (event.type === "tool_execution_start") {
            terminal.write(`\n${event.name}${event.description ? `: ${event.description}` : ''}\n`);
            terminal.write(`\nINPUT: ${JSON.stringify(event.input)}\n`);
        } else if (event.type === "tool_execution_end") {
            terminal.write(`OUTPUT: ${renderToolOutput(event.output)}\n`);
        } else if (event.type === "tool_execution_update") {
            // terminal.write(event.text);
            // pass through
        }
    }
    terminal.write("\n");
});