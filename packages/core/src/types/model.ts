import { AssistantMessageEventStream } from "../event-stream";
import { InputMessage, ThinkingConfig, ToolParams } from "./messages";

export type Transport = "websocket" | "sse";

export interface ModelConfig {
    model: string;
    system?: string;
    thinking?: ThinkingConfig;
    max_tokens?: number;
    apiKey?: string;
    authToken?: string;
    transport?: Transport;
    /** Optional session identifier for providers that support session-based caching. 
     * Providers can use this to enable session-aware features. Ignored by providers that don't support it. */
    sessionId?: string;
}

export interface CanonicalRequest {
    messages: InputMessage[];
    tools?: ToolParams[];
}

export interface LLMProvider {
    stream(request: CanonicalRequest): AssistantMessageEventStream;
}
