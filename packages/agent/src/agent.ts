import { AnthropicProvider, AssistantMessage, AssistantMessageStreamEvent, EventStream, InputMessage, LLMProvider, OpenAIProvider, ToolResultBlock, ToolResultContent } from "@jay-ai/core";
import { AgentConfig } from "./types/agents";
import { AgentTool } from "./types/tools";

export type ToolExecutionEvent =
    | { type: "tool_execution_start"; tool_use_id: string; name: string }
    | { type: "tool_execution_update"; tool_use_id: string; text: string }
    | { type: "tool_execution_end"; tool_use_id: string; name: string };

export type AgentStreamEvent = AssistantMessageStreamEvent | ToolExecutionEvent;

export class AgentEventStream extends EventStream<AgentStreamEvent, AssistantMessage> {}

function createProvider(config: AgentConfig): LLMProvider {
    switch (config.modelProvider) {
        case "anthropic": return new AnthropicProvider(config);
        case "openai": return new OpenAIProvider(config);
    }
}

export class Agent {
    readonly provider: LLMProvider;
    private config: AgentConfig;
    private messages: InputMessage[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private tools: Record<string, AgentTool<any>> = {};

    constructor(config: AgentConfig, tools: AgentTool<any>[] = []) {
        this.config = config;
        this.provider = createProvider(config);
        for (const tool of tools) {
            this.registerTool(tool);
        }
    }

    registerTool(tool: AgentTool<any>) {
        this.tools[tool.name] = tool;
    }

    run(input: string): AgentEventStream {
        this.messages.push({
            role: "user",
            content: [{ type: "text", text: input }],
        });
        const agentStream = new AgentEventStream();
        (async () => {
            let loop_number = 0;
            const max_loops = 100;
            while (loop_number < max_loops) {
                loop_number++;
                const stream = this.provider.stream({
                    messages: this.messages,
                    tools: Object.values(this.tools).map(({ name, description, input_schema }) => ({
                        name,
                        description,
                        input_schema,
                    })),
                });
                for await (const event of stream) {
                    agentStream.push(event);
                }
                const assistantMessage = stream.getFinalOutput();
                if (assistantMessage) {
                    this.messages.push({
                        role: assistantMessage.role,
                        content: assistantMessage.content,
                    });
                }
                if (assistantMessage?.stop_reason === "tool_use") {
                    const toolResults: ToolResultBlock[] = [];
                    for (const content of assistantMessage.content) {
                        if (content.type !== "tool_use") continue;
                        agentStream.push({ type: "tool_execution_start", tool_use_id: content.id, name: content.name });
                        const toolOutput = await this.callTool(content.name, content.input);
                        agentStream.push({ type: "tool_execution_end", tool_use_id: content.id, name: content.name });
                        toolResults.push({ type: "tool_result", tool_use_id: content.id, content: toolOutput });
                    }
                    // Anthropic requires the tool results to be combined into a single user message.
                    this.messages.push({ role: "user", content: toolResults });
                } else if (
                    assistantMessage?.stop_reason === "end_turn" ||
                    assistantMessage?.stop_reason === "max_tokens"
                ) {
                    break;
                }
            }
            agentStream.close();
        })();
        return agentStream;
    }

    private async callTool(toolName: string, inputParams: Record<string, unknown>): Promise<ToolResultContent> {
        const tool = this.tools[toolName];
        if (!tool) throw new Error(`Tool ${toolName} not found`);
        return await tool.func(inputParams);
    }

    getAgentConfig(): AgentConfig {
        return this.config;
    }

    getMessages(): InputMessage[] {
        return this.messages;
    }
}
