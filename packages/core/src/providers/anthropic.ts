import { Anthropic } from "@anthropic-ai/sdk";
import { AssistantMessageEventStream } from "../event-stream";
import { AssistantMessage, TextBlock, ThinkingBlock, ThinkingConfigParam, ToolUseBlock } from "../types/messages";
import { CanonicalRequest, LLMProvider } from "./types";

const DEFAULT_THINKING_BUDGET_TOKENS = 16000;
const DEFAULT_MAX_TOKENS = 20000;

// Internal type for accumulating streamed tool input JSON
interface ToolBlockAccumulator extends ToolUseBlock {
    input_json: string;
}

export interface AnthropicProviderConfig {
    model: string;
    system?: string;
    thinking?: ThinkingConfigParam;
    max_tokens?: number;
    apiKey?: string;
}

export class AnthropicProvider implements LLMProvider {
    private client: Anthropic;

    constructor(private config: AnthropicProviderConfig) {
        this.client = new Anthropic({ apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY });
    }

    stream(request: CanonicalRequest): AssistantMessageEventStream {
        const eventStream = new AssistantMessageEventStream();
        const { config } = this;
        const maxTokens = config.max_tokens ?? DEFAULT_MAX_TOKENS;
        const budgetTokens = config.thinking?.type === "enabled"
            ? config.thinking.budget_tokens
            : DEFAULT_THINKING_BUDGET_TOKENS;

        if (maxTokens <= budgetTokens) {
            throw new Error(`max_tokens (${maxTokens}) must be greater than thinking.budget_tokens (${budgetTokens})`);
        }

        (async () => {
            const anthropicStream = this.client.messages.stream({
                model: config.model,
                system: config.system,
                messages: request.messages as Parameters<typeof this.client.messages.stream>[0]["messages"],
                tools: request.tools?.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
                max_tokens: maxTokens,
                stream: true,
                thinking: config.thinking?.type === "enabled"
                    ? config.thinking
                    : { type: "enabled", budget_tokens: DEFAULT_THINKING_BUDGET_TOKENS },
            });

            const output: AssistantMessage = { role: "assistant", content: [] };

            for await (const event of anthropicStream) {
                if (event.type === "message_start") {
                    eventStream.push({ type: "message_start", text: "" });
                } else if (event.type === "content_block_start") {
                    if (event.content_block.type === "text") {
                        output.content.push({ type: "text", text: "" });
                        eventStream.push({ type: "text_start", index: event.index });
                    } else if (event.content_block.type === "thinking") {
                        output.content.push({ type: "thinking", thinking: "", signature: "" });
                        eventStream.push({ type: "thinking_start", index: event.index });
                    } else if (event.content_block.type === "tool_use") {
                        output.content.push({
                            type: "tool_use",
                            id: event.content_block.id,
                            name: event.content_block.name,
                            input: {},
                            input_json: "",
                        } as ToolBlockAccumulator);
                        eventStream.push({ type: "tool_use_start", index: event.index, id: event.content_block.id, name: event.content_block.name });
                    }
                } else if (event.type === "content_block_delta") {
                    if (event.delta.type === "text_delta") {
                        (output.content[event.index] as TextBlock).text += event.delta.text;
                        eventStream.push({ type: "text_delta", index: event.index, text: event.delta.text });
                    } else if (event.delta.type === "thinking_delta") {
                        (output.content[event.index] as ThinkingBlock).thinking += event.delta.thinking;
                        eventStream.push({ type: "thinking_delta", index: event.index, thinking: event.delta.thinking });
                    } else if (event.delta.type === "signature_delta") {
                        (output.content[event.index] as ThinkingBlock).signature += event.delta.signature;
                        eventStream.push({ type: "signature_delta", index: event.index, signature: event.delta.signature });
                    } else if (event.delta.type === "input_json_delta") {
                        (output.content[event.index] as ToolBlockAccumulator).input_json += event.delta.partial_json;
                        eventStream.push({ type: "tool_input_json_delta", index: event.index, partial_json: event.delta.partial_json });
                    }
                } else if (event.type === "content_block_stop") {
                    const block = output.content[event.index];
                    if (block.type === "tool_use") {
                        block.input = JSON.parse((block as ToolBlockAccumulator).input_json);
                        (block as Partial<ToolBlockAccumulator>).input_json = undefined;
                    }
                } else if (event.type === "message_delta") {
                    output.stop_reason = event.delta.stop_reason as AssistantMessage["stop_reason"];
                } else if (event.type === "message_stop") {
                    eventStream.setFinalOutput(output);
                    eventStream.close();
                }
            }
        })();

        return eventStream;
    }
}
