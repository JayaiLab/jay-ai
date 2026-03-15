import { ToolParams, ToolResultContent } from "@jay-ai/core";

export interface AgentTool<T extends Record<string, unknown> = Record<string, unknown>> extends ToolParams {
    func: (input: T) => ToolResultContent | Promise<ToolResultContent>;
}
