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

const weatherAgent = new Agent({
    model: "claude-haiku-4-5",
    systemMessage: "You are a helpful assistant.",
    max_tokens: 20000,
}, [weatherTool]);

const weatherStream = weatherAgent.run("What is the weather like in San Francisco?");

for await (const event of weatherStream) {
    const timestamp = new Date().getTime();
    console.log(`${timestamp} weather.stream`, event);
}

// console.log("weatherAgent.getMessages()", JSON.stringify(weatherAgent.getMessages(), null, 2));