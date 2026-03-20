import { program } from "commander";
import { Terminal } from "@jay-ai/tui";
import { runLogin } from "../login";
import { runChat } from "./chat";
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
    .action(async () => {
        const terminal = new Terminal();
        await runChat(terminal);
    });

await program.parseAsync();
