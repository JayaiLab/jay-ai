import { program } from "commander";
import { selectFromOptions, Terminal } from "@jay-ai/tui";
import { runLogin } from "../login";
import { ChatMode, resolveAuth } from "./chat-mode";
import { ALL_MODELS } from "./models";
import { loadSettings, saveSettings } from "../settings";

const version = import.meta.env.VERSION ?? "dev";

function requireAuth() {
    const auth = resolveAuth();
    if (!auth) {
        console.error("No model selected. Run `jayai login` to authenticate and `jayai model` to select a model.");
        process.exit(1);
    }
    return auth;
}

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

program
    .command("model")
    .description("Select a model to use")
    .action(async () => {
        const terminal = new Terminal();
        terminal.write("Select a model:\n");
        const i = await selectFromOptions(terminal, ALL_MODELS.map(m => ({
            label: m.id,
            description: `${m.description} (${m.provider})`,
        })));
        const chosen = ALL_MODELS[i];
        saveSettings({ ...loadSettings(), model: chosen.id, modelProvider: chosen.provider });
        terminal.write(`Model set to ${chosen.id} (${chosen.provider})\n`);
        process.exit(0);
    });

program
    .command("chat")
    .description("Start an interactive chat session")
    .action(() => {
        new ChatMode(requireAuth()).start();
    });
program
    .command("debug")
    .description("Start an interactive chat session with debug options")
    .option("--step-through", "Pause after each event, press 'k' to continue")
    .option("--capture-agent-stream", "Save each agent run to AGENT_STREAM_<timestamp>.jsonl")
    .option("--tui-debug", "Emit debug logs to /tmp/jayai-debug.log in real time")
    .action((opts) => {
        new ChatMode(requireAuth(), true, {
            stepThrough: opts.stepThrough ?? false,
            captureAgentStream: opts.captureAgentStream ?? false,
            tuiDebug: opts.tuiDebug ?? false,
        }).start();
    });

program.action(() => {
    if (program.args.length) {
        console.error(`Unknown command: ${program.args.join(" ")}\nRun 'jayai --help' to see available commands.`);
        process.exit(1);
    }
    new ChatMode(requireAuth()).start();
});

export async function main(args: string[]) {
    await program.parseAsync(args);
}
