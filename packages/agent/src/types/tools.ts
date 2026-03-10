import { ToolParams } from "@jay-ai/core";

export interface Tool extends ToolParams {
    func: (input: Record<string, unknown>) => string | Promise<string>;
}
