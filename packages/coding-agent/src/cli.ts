import { Agent, AgentTool } from "@jay-ai/agent";
import { Type, type Static } from "@sinclair/typebox";
import { Terminal } from "@jay-ai/tui";
import readTool from "./tools/read";

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
    system: "You are a helpful assistant.",
    max_tokens: 16000,
}, [weatherTool, readTool]);

terminal.write("Welcome to Jay AI. Type a message to get started.\n\n");

terminal.addEventListener("inputSubmitted", async (event) => {
    const stream = agent.run(event.input);
    for await (const event of stream) {
        if (event.type === "text_delta") {
            terminal.write(event.text);
        }
    }
    terminal.write("\n");
});