import { program } from "commander";
import { Terminal } from "@jay-ai/tui";
import { runLogin } from "../login";
import { ChatMode } from "./chat-mode";
import { registerModelsCommand } from "./models";

const version = import.meta.env.VERSION ?? "dev";

try {
    process.loadEnvFile();
} catch {
    // .env not found, continue with existing environment
}

program
    .name("jayai")
    .description("Jay AI coding agent")
    .version(version);

program
    .command("login")
    .description("Authenticate with an OAuth provider")
    .action(async () => {
        const terminal = new Terminal();
        await runLogin(terminal);
        process.exit(0);
    });

registerModelsCommand(program);

program
    .command("chat", { isDefault: true })
    .description("Start an interactive chat session")
    .action(() => {
        new ChatMode().start();
    });
program
    .command("debug")
    .description("Start an interactive chat session with debug options")
    .option("--step-through", "Pause after each event, press 'k' to continue")
    .option("--capture-agent-stream", "Save each agent run to AGENT_STREAM_<timestamp>.jsonl")
    .option("--tui-debug", "Emit debug logs to /tmp/jayai-debug.log in real time")
    .action((opts) => {
        new ChatMode(true, {
            stepThrough: opts.stepThrough ?? false,
            captureAgentStream: opts.captureAgentStream ?? false,
            tuiDebug: opts.tuiDebug ?? false,
        }).start();
    });

await program.parseAsync();
