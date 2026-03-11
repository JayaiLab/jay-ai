import { ThinkingConfigParam } from "@jay-ai/core";

export type ModelProvider = "anthropic" | "openai";

export interface AgentConfig {
    model: string;
    modelProvider: ModelProvider;
    system?: string;
    thinking?: ThinkingConfigParam;
    max_tokens?: number;
}
