import * as readline from "readline";
import { Agent } from "@jay-ai/agent";
import type { Tool } from "@jay-ai/agent";
import { Terminal } from "@jay-ai/tui";

try {
    process.loadEnvFile();
} catch {
    // .env not found, continue with existing environment
}

const terminal = new Terminal();

const weatherTool: Tool = {
    name: "get_weather",
    description: "Get the current weather for a city.",
    input_schema: {
        type: "object",
        properties: {
            city: { type: "string", description: "The city name." },
        },
        required: ["city"],
    },
    func: (input) => {
        const city = input.city as string;
        if (city === "New York") return "rainy, 50°F";
        if (city === "San Francisco") return "sunny, 60°F";
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
    system: "You are a helpful assistant.",
    max_tokens: 16000,
}, [weatherTool]);

terminal.addEventListener("inputSubmitted", async (event) => {
    const stream = agent.run(event.input);
    for await (const event of stream) {
        if (event.type === "text_delta") {
            terminal.write(event.text);
        }
    }
    terminal.write("\n");
});