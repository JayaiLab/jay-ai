import { anthropicOAuthProvider } from "@jay-ai/core";
import type { OAuthProviderInterface } from "@jay-ai/core";
import { Terminal, selectFromOptions } from "@jay-ai/tui";
import { saveAuth } from "./auth.js";
import { openUrl } from "./open-url.js";

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
    terminal.write("Select an OAuth provider:\n");
    const i = await selectFromOptions(terminal, PROVIDERS.map(p => ({ label: p.name })));
    const provider = PROVIDERS[i];

    terminal.write(`\nLogging in with ${provider.name}...\n\n`);

    try {
        const credentials = await provider.login({
            onAuth: ({ url }) => {
                terminal.write(`Opening this URL in your browser:\n\n  ${url}\n\n`);
                terminal.write("After authorizing, paste the code below:\n> ");
                openUrl(url);
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
