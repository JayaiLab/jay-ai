import { ModelConfig } from "@jay-ai/core";

export type ModelProvider = "anthropic" | "openai";

export interface AgentConfig extends ModelConfig {
    modelProvider: ModelProvider;
}
