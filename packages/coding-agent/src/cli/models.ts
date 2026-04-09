import { ModelProvider } from "@jay-ai/agent";
import { loadAllAuth } from "../auth";

export const MODELS: Record<ModelProvider, { id: string; description: string }[]> = {
    "anthropic": [
        { id: "claude-opus-4-6", description: "Most capable Claude model" },
        { id: "claude-sonnet-4-6", description: "Balanced performance and speed" },
        { id: "claude-opus-4-5", description: "Previous generation Opus" },
    ],
    "openai": [
        { id: "gpt-4o", description: "Flagship GPT-4 multimodal model" },
        { id: "gpt-4o-mini", description: "Smaller, faster GPT-4o" },
        { id: "o3", description: "Advanced reasoning model" },
        { id: "o4-mini", description: "Fast reasoning model" },
    ],
    "openai-codex": [
        { id: "gpt-5.4", description: "Flagship model with coding, reasoning, and agentic workflows" },
        { id: "gpt-5.4-mini", description: "Fast, efficient model for responsive coding and subagents" },
        { id: "gpt-5.3-codex", description: "Industry-leading coding model for complex software engineering" },
        { id: "gpt-5.3-codex-spark", description: "Near-instant real-time coding iteration (Pro only)" },
    ],
};

export const ALL_MODELS = Object.entries(MODELS).flatMap(([provider, models]) =>
    models.map(m => ({ ...m, provider: provider as ModelProvider }))
);

/** Return only models whose provider has stored auth credentials. */
export function getAuthenticatedModels() {
    const authed = loadAllAuth();
    return ALL_MODELS.filter(m => authed[m.provider]?.access);
}


