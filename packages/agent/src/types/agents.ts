import { AssistantMessageStreamEvent, ModelConfig, ToolResultContent } from "@jay-ai/core";

export type ModelProvider = "anthropic" | "openai";

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
    // Only emitted for assistant messages during streaming
    | { type: "message_update"; assistantMessageEvent: AssistantMessageStreamEvent }
    | { type: "message_end"; }
    // Tool execution lifecycle
    | ToolExecutionEvent;
