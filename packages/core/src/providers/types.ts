import { AssistantMessageEventStream } from "../event-stream";
import { InputMessage, ToolParams } from "../types/messages";

export interface CanonicalRequest {
    messages: InputMessage[];
    tools?: ToolParams[];
}

export interface LLMProvider {
    stream(request: CanonicalRequest): AssistantMessageEventStream;
}
