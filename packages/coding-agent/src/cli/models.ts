import type { Command } from "commander";

const MODELS: Record<string, { id: string; description: string }[]> = {
    anthropic: [
        { id: "claude-opus-4-6",    description: "Most capable Claude model" },
        { id: "claude-sonnet-4-6",  description: "Balanced performance and speed" },
        { id: "claude-opus-4-5",    description: "Previous generation Opus" },
    ],
    openai: [
        { id: "gpt-4o",      description: "Flagship GPT-4 multimodal model" },
        { id: "gpt-4o-mini", description: "Smaller, faster GPT-4o" },
        { id: "o3",          description: "Advanced reasoning model" },
        { id: "o4-mini",     description: "Fast reasoning model" },
    ],
};

export function registerModelsCommand(program: Command): void {
    program
        .command("models")
        .description("List available models")
        .option("--provider <name>", "Filter by provider (anthropic, openai)")
        .action((opts: { provider?: string }) => {
            if (opts.provider) {
                const models = MODELS[opts.provider.toLowerCase()];
                if (!models) {
                    process.stderr.write(`Unknown provider: ${opts.provider}\n`);
                    process.stderr.write(`Available providers: ${Object.keys(MODELS).join(", ")}\n`);
                    process.exit(1);
                }
                for (const m of models) {
                    process.stdout.write(`${m.id}\t${m.description}\n`);
                }
            } else {
                for (const [provider, models] of Object.entries(MODELS)) {
                    for (const m of models) {
                        process.stdout.write(`${provider}\t${m.id}\t${m.description}\n`);
                    }
                }
            }
        });
}
