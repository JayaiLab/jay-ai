import { anthropicOAuthProvider } from "@jay-ai/core";
import type { OAuthProviderInterface } from "@jay-ai/core";
import { Terminal } from "@jay-ai/tui";
import { saveAuth } from "./auth.js";

const PROVIDERS: OAuthProviderInterface[] = [anthropicOAuthProvider];

function waitForInput(terminal: Terminal): Promise<string> {
    return new Promise<string>((resolve) => {
        let buffer = "";
        terminal.setDataHandler((key: string) => {
            if (key === "\r") {
                terminal.write("\n");
                terminal.setDataHandler(() => {});
                resolve(buffer.trim());
            } else if (key === "\x7f") {
                if (buffer.length > 0) {
                    buffer = buffer.slice(0, -1);
                    process.stdout.write("\b \b");
                }
            } else {
                buffer += key;
                process.stdout.write(key);
            }
        });
    });
}

export async function runLogin(terminal: Terminal): Promise<void> {
    terminal.write("Select an OAuth provider:\n\n");
    PROVIDERS.forEach((p, i) => terminal.write(`  ${i + 1}. ${p.name}\n`));
    terminal.write("\n> ");

    const choice = await waitForInput(terminal);
    const index = parseInt(choice.trim(), 10) - 1;
    const provider = PROVIDERS[index];
    if (!provider) {
        terminal.write("Invalid selection.\n");
        process.exit(1);
    }

    terminal.write(`\nLogging in with ${provider.name}...\n\n`);

    try {
        const credentials = await provider.login({
            onAuth: ({ url }) => {
                terminal.write(`Open this URL in your browser:\n\n  ${url}\n\n`);
                terminal.write("After authorizing, paste the code below:\n> ");
            },
            onPrompt: () => waitForInput(terminal),
        });

        await saveAuth({ provider: provider.id, credentials });
        terminal.write(`\nCredentials saved to ~/.jayai/auth.json\n`);
        terminal.write(`Access token expires at ${new Date(credentials.expires).toLocaleString()}\n`);
    } catch (err) {
        terminal.write(`\nLogin failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    }
}
