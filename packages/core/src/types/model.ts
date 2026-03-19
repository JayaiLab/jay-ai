import { AssistantMessageEventStream } from "../event-stream";
import { InputMessage, ThinkingConfig, ToolParams } from "./messages";

export interface ModelConfig {
    model: string;
    system?: string;
    thinking?: ThinkingConfig;
    max_tokens?: number;
    apiKey?: string;
    authToken?: string;
}

export interface CanonicalRequest {
    messages: InputMessage[];
    tools?: ToolParams[];
}

export interface LLMProvider {
    stream(request: CanonicalRequest): AssistantMessageEventStream;
}
