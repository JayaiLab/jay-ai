import { AssistantMessage, AssistantMessageStreamEvent, ModelConfig, ToolResultContent } from "@jay-ai/core";

export type ModelProvider = "anthropic" | "openai" | "openai-codex";

export interface AgentConfig extends ModelConfig {
    modelProvider: ModelProvider;
}

export type ToolExecutionEvent =
    | { type: "tool_execution_start"; tool_use_id: string; name: string; description?: string; input: Record<string, unknown> }
    | { type: "tool_execution_update"; tool_use_id: string; text: string }
    | { type: "tool_execution_end"; tool_use_id: string; name: string; output: ToolResultContent };

/**
* Events emitted by the Agent for UI updates.
* These events provide fine-grained lifecycle information for messages, turns, and tool executions.
*/
export type AgentStreamEvent =
    // Message lifecycle - emitted for user, assistant, and toolResult messages
    | { type: "message_start" }
    // `streamEvent.snapshot` is the accumulated message state so far — re-render on every message_update.
    | { type: "message_update"; streamEvent: AssistantMessageStreamEvent }
    | { type: "message_end"; }
    // Error events — emitted when the provider returns an error (e.g. rate limit)
    | { type: "error"; error: unknown }
    // Tool execution lifecycle
    | ToolExecutionEvent;
