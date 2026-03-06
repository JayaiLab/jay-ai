import { Anthropic } from "@anthropic-ai/sdk";
import { AssistantMessageEventStream } from "../event-stream";
import { AnthropicParams, AssistantMessage, AssistantMessageContent, AssistantToolBlock, TextBlock, ThinkingBlock } from "../types/messages";

export const DEFAULT_THINKING_BUDGET_TOKENS = 16000;
export const DEFAULT_MAX_TOKENS = 20000;

function validateParams(inputParams: AnthropicParams): void {
    const maxTokens = inputParams.max_tokens ?? DEFAULT_MAX_TOKENS;
    const budgetTokens = inputParams.thinking?.type === "enabled"
        ? (inputParams.thinking.budget_tokens ?? DEFAULT_THINKING_BUDGET_TOKENS)
        : DEFAULT_THINKING_BUDGET_TOKENS;

    if (maxTokens <= budgetTokens) {
        throw new Error(
            `max_tokens (${maxTokens}) must be greater than thinking.budget_tokens (${budgetTokens})`
        );
    }
}

function addNewContentBlock(output: AssistantMessage, index: number, block: AssistantMessageContent): void {
    if (index >= output.content.length) {
        output.content.push(block);
    } else {
        output.content[index] = block;
    }
}

export function streamAnthropic(inputParams: AnthropicParams): AssistantMessageEventStream {
    validateParams(inputParams);
    const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    });
    const stream = new AssistantMessageEventStream();
    (async () => {
        const anthropicStream = client.messages.stream({
            ...inputParams,
            stream: true,
            max_tokens: inputParams.max_tokens ?? DEFAULT_MAX_TOKENS,
            thinking: inputParams.thinking?.type === "enabled"
                ? inputParams.thinking
                : { type: "enabled", budget_tokens: DEFAULT_THINKING_BUDGET_TOKENS }
        });
        // client.messages.create

        const output: AssistantMessage = {
            role: "assistant",
            content: [],
        };
        for await (const event of anthropicStream) {
            console.log("streamAnthropic.anthropicStream", event);
            if (event.type === "message_start") {
                stream.push({
                    type: "message_start",
                    text: "",
                });
            } else if (event.type === "content_block_start") {
                if (event.content_block.type === "text") {
                    addNewContentBlock(output, event.index, {
                        type: "text",
                        text: "",
                    });
                    stream.push({
                        type: "text_start",
                        index: event.index,
                    });
                } else if (event.content_block.type === "thinking") {
                    addNewContentBlock(output, event.index, {
                        type: "thinking",
                        thinking: "",
                        signature: ""
                    });
                    stream.push({
                        type: "thinking_start",
                        index: event.index,
                    });
                } else if (event.content_block.type === "tool_use") {
                    addNewContentBlock(output, event.index, {
                        type: "tool_use",
                        id: event.content_block.id,
                        name: event.content_block.name,
                        input: {},
                        input_json: "",
                    });
                    stream.push({
                        type: "tool_use_start",
                        index: event.index,
                        id: event.content_block.id,
                        name: event.content_block.name,

                    });
                }
            } else if (event.type === "content_block_delta") {
                if (event.delta.type === "text_delta") {
                    stream.push({
                        type: "text_delta",
                        index: event.index,
                        text: event.delta.text,
                    });
                    (output.content[event.index] as TextBlock).text += event.delta.text;

                } else if (event.delta.type === "thinking_delta") {
                    stream.push({
                        type: "thinking_delta",
                        index: event.index,

                        thinking: event.delta.thinking,
                    });
                    (output.content[event.index] as ThinkingBlock).thinking += event.delta.thinking;
                } else if (event.delta.type === "signature_delta") {
                    stream.push({
                        type: "signature_delta",
                        index: event.index,
                        signature: event.delta.signature,
                    });
                    (output.content[event.index] as ThinkingBlock).signature += event.delta.signature;
                } else if (event.delta.type === "input_json_delta") {
                    stream.push({
                        type: "tool_input_json_delta",
                        index: event.index,
                        partial_json: event.delta.partial_json,
                    });
                    (output.content[event.index] as AssistantToolBlock).input_json += event.delta.partial_json;
                }
            } else if (event.type === "content_block_stop") {
                if (output.content[event.index].type === "tool_use") {
                    // json parse the input_json
                    const input = JSON.parse((output.content[event.index] as AssistantToolBlock).input_json);
                    (output.content[event.index] as AssistantToolBlock).input = input;
                }
            } else if (event.type === "message_delta") {
                // pass through add stop reason
                output.stop_reason = event.delta.stop_reason as 'end_turn' | 'tool_use' | 'max_tokens';
            }
            else if (event.type === "message_stop") {
                stream.setFinalOutput(output);
                stream.close();
            }
        }
    })();
    return stream;
}