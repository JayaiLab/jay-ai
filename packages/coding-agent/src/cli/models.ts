export const MODELS: Record<string, { id: string; description: string }[]> = {
    anthropic: [
        { id: "claude-opus-4-6", description: "Most capable Claude model" },
        { id: "claude-sonnet-4-6", description: "Balanced performance and speed" },
        { id: "claude-opus-4-5", description: "Previous generation Opus" },
    ],
    openai: [
        { id: "gpt-4o", description: "Flagship GPT-4 multimodal model" },
        { id: "gpt-4o-mini", description: "Smaller, faster GPT-4o" },
        { id: "o3", description: "Advanced reasoning model" },
        { id: "o4-mini", description: "Fast reasoning model" },
    ],
};

export const ALL_MODELS = Object.entries(MODELS).flatMap(([provider, models]) =>
    models.map(m => ({ ...m, provider }))
);


