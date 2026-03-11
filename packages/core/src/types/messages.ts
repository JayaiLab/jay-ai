export type AssistantMessageStreamEvent = {
    type: "message_start";
    text: string;
} | {
    type: "thinking_start";
    index: number;
} | {
    type: "tool_use_start";
    index: number;
    id: string;
    name: string;
} | {
    type: "text_start";
    index: number;
} | {
    type: "text_delta";
    index: number;
    text: string;
} | {
    type: "thinking_delta";
    index: number;
    thinking: string;
} | {
    type: "signature_delta";
    index: number;
    signature: string;
} | {
    type: "tool_input_json_delta";
    index: number;
    partial_json: string;
} | {
    type: "thinking_signature_delta";
}

export interface TextBlock {
    type: "text";
    text: string;
}

export interface ThinkingBlock {
    type: "thinking";
    thinking: string;
    signature: string;
}

export interface ToolUseBlock {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, unknown>;
}

export interface ToolResultBlock {
    type: "tool_result";
    tool_use_id: string;
    content: string;
}

export type InputMessageContent = TextBlock | ToolUseBlock | ThinkingBlock | ToolResultBlock;

export type InputMessage = {
    role: "user" | "assistant";
    content: string | InputMessageContent[];
}

export type AssistantMessageContent = TextBlock | ToolUseBlock | ThinkingBlock;

export type AssistantMessage = {
    role: "assistant";
    content: AssistantMessageContent[];
    stop_reason?: "end_turn" | "tool_use" | "max_tokens";
}

export namespace ToolScope {
    export interface InputSchema {
        type: "object";
        properties?: Record<string, Property>;
        required?: Array<string> | null;
        [k: string]: unknown;
    }
    export interface Property {
        type: "string" | "number" | "boolean" | "array" | "object" | string;
        description: string;
    }
}

export interface ToolParams {
    name: string;
    description: string;
    input_schema: ToolScope.InputSchema;
}

export type ThinkingConfigEnabled = {
    type: "enabled";
    budget_tokens: number;
}
export type ThinkingConfigDisabled = {
    type: "disabled";
}
export type ThinkingConfigAdaptive = {
    type: "adaptive";
    effort: "low" | "medium" | "high";
}
export type ThinkingConfigParam = ThinkingConfigEnabled | ThinkingConfigDisabled | ThinkingConfigAdaptive;
