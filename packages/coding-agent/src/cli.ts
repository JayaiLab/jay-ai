import * as readline from "readline";
import { Agent } from "@jay-ai/agent";

const agent = new Agent({
    model: "claude-sonnet-4-6",
    modelProvider: "anthropic",
    system: "You are a helpful assistant.",
    max_tokens: 16000,
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "You: ",
});

console.log('Coding Agent CLI. Type "exit" to quit.\n');
rl.prompt();

for await (const line of rl) {
    const input = line.trim();

    if (!input) {
        rl.prompt();
        continue;
    }

    if (input.toLowerCase() === "exit") {
        console.log("Goodbye!");
        break;
    }

    process.stdout.write("\nAssistant: ");
    const stream = agent.run(input);

    for await (const event of stream) {
        if (event.type === "text_delta") {
            process.stdout.write(event.text);
        } else if (event.type === "thinking_delta") {
            process.stdout.write(event.thinking);
        } else if (event.type === "tool_use_start") {
            process.stdout.write(event.name);
        }
    }

    console.log("\n");
    rl.prompt();
}

rl.close();
