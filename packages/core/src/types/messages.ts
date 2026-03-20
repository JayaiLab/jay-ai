
/**
 * Every event carries `snapshot` — the accumulated message state up to this point in the stream.
 * Downstream consumers (e.g. terminal renderers) can use it to re-render the full response on each event
 * without needing to track incremental deltas themselves.
 */
export type AssistantMessageStreamEvent = {
    type: "message_start";
    snapshot: AssistantMessage;
} | {
    type: "message_end";
    output: AssistantMessage;
    snapshot: AssistantMessage;
} | {
    type: "thinking_start";
    index: number;
    snapshot: AssistantMessage;
} | {
    type: "tool_use_start";
    index: number;
    id: string;
    name: string;
    snapshot: AssistantMessage;
} | {
    type: "text_start";
    index: number;
    snapshot: AssistantMessage;
} | {
    type: "text_delta";
    index: number;
    text: string;
    snapshot: AssistantMessage;
} | {
    type: "thinking_delta";
    index: number;
    thinking: string;
    snapshot: AssistantMessage;
} | {
    type: "signature_delta";
    index: number;
    signature: string;
    snapshot: AssistantMessage;
} | {
    type: "thinking_end";
    index: number;
    snapshot: AssistantMessage;
} | {
    type: "text_end";
    index: number;
    snapshot: AssistantMessage;
} | {
    type: "tool_input_json_delta";
    index: number;
    partial_json: string;
    snapshot: AssistantMessage;
};

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


export interface Base64ImageSource {
    type: "base64";
    data: string;
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}
export interface UrlImageSource {
    type: "url";
    url: string;
}
export interface ImageBlock {
    type: "image";
    source: Base64ImageSource | UrlImageSource;
}

export type DocumentMediaType =
    | "application/pdf"
    // spreadsheets
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    | "application/vnd.ms-excel"
    | "text/csv"
    | "text/tsv"
    | "application/x-iif"
    // word / rich docs
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "application/msword"
    | "application/rtf"
    | "application/vnd.oasis.opendocument.text"
    | "application/vnd.apple.pages"
    // presentations
    | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    | "application/vnd.ms-powerpoint"
    | "application/vnd.apple.keynote";

export interface DocumentBlock {
    type: "document";
    source: {
        type: "base64";
        media_type: DocumentMediaType;
        data: string;
    };
    filename?: string;
}

export type ToolResultContent = string | Array<TextBlock | ImageBlock | DocumentBlock>;

export interface ToolResultBlock {
    type: "tool_result";
    tool_use_id: string;
    content: ToolResultContent;
}

export type InputMessageContent = TextBlock | ToolUseBlock | ThinkingBlock | ToolResultBlock | DocumentBlock;

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
        description?: string;
    }
}

export interface ToolParams {
    name: string;
    description?: string;
    input_schema: ToolScope.InputSchema;
}

export type ThinkingEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ThinkingConfig {
    effort: ThinkingEffort;
}
