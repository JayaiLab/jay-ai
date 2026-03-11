import { AnthropicProvider, AssistantMessageEventStream, InputMessage, LLMProvider, OpenAIProvider } from "@jay-ai/core";
import { AgentConfig } from "./types/agents";
import { Tool } from "./types/tools";

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
    private tools: Record<string, Tool> = {};

    constructor(config: AgentConfig, tools: Tool[] = []) {
        this.config = config;
        this.provider = createProvider(config);
        for (const tool of tools) {
            this.registerTool(tool);
        }
    }

    registerTool(tool: Tool) {
        this.tools[tool.name] = tool;
    }

    run(input: string): AssistantMessageEventStream {
        this.messages.push({
            role: "user",
            content: [{ type: "text", text: input }],
        });
        const agentStream = new AssistantMessageEventStream();
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
                    for (const content of assistantMessage.content) {
                        if (content.type !== "tool_use") continue;
                        const toolOutput = await this.callTool(content.name, content.input);
                        this.messages.push({
                            role: "user",
                            content: [{ type: "tool_result", tool_use_id: content.id, content: toolOutput }],
                        });
                    }
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

    private async callTool(toolName: string, inputParams: Record<string, unknown>): Promise<string> {
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
