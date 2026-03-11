import { Agent } from "../src/agent";
import { Tool } from "../src/types/tools";

function getWeather(city: string): string {
    if (city === "New York") {
        return "rainy, 50 degrees";
    } else if (city === "San Francisco") {
        return "sunny, 60 degrees";
    } else {
        return "sunny, 70 degrees";
    }
}

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
    func: (input) => getWeather(input.city as string),
};

console.log("--- Anthropic ---");
const anthropicAgent = new Agent({
    model: "claude-haiku-4-5",
    modelProvider: "anthropic",
    system: "You are a helpful assistant.",
}, [weatherTool]);

for await (const event of anthropicAgent.run("What is the weather like in San Francisco?")) {
    console.log(event);
}

console.log("--- OpenAI ---");
const openaiAgent = new Agent({
    model: "gpt-4o-mini",
    modelProvider: "openai",
    system: "You are a helpful assistant.",
    max_tokens: 1000,
}, [weatherTool]);

for await (const event of openaiAgent.run("What is the weather like in San Francisco?")) {
    console.log(event);
}
