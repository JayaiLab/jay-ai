import { ThinkingConfigParam } from "@jay-ai/core";
export interface AgentParams {
    model: string;
    systemMessage: string;
    thinking?: ThinkingConfigParam;
    max_tokens?: number;
}

export interface AgentRunConfig {
}   