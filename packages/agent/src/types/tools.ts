import { ToolParams, ToolResultContent } from "@jay-ai/core";

export interface ToolCallContext {
    onUpdate: (text: string) => void;
}

export interface AgentTool<T extends Record<string, unknown> = Record<string, unknown>> extends ToolParams {
    func: (input: T, context?: ToolCallContext) => ToolResultContent | Promise<ToolResultContent>;
}
