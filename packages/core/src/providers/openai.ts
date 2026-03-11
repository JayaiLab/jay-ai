import OpenAI from "openai";
import { AssistantMessageEventStream } from "../event-stream";
import { AssistantMessage, InputMessage, InputMessageContent, TextBlock, ToolParams, ToolResultBlock, ToolUseBlock } from "../types/messages";
import { CanonicalRequest, LLMProvider, ModelConfig } from "../types/model";

export class OpenAIProvider implements LLMProvider {
    private client: OpenAI;

    constructor(private config: ModelConfig) {
        this.client = new OpenAI({ apiKey: config.apiKey ?? process.env.OPENAI_API_KEY });
    }

    private buildMessages(messages: InputMessage[]): OpenAI.ChatCompletionMessageParam[] {
        const result: OpenAI.ChatCompletionMessageParam[] = [];

        if (this.config.system) {
            result.push({ role: "system", content: this.config.system });
        }

        for (const msg of messages) {
            if (typeof msg.content === "string") {
                result.push({ role: msg.role as "user" | "assistant", content: msg.content });
                continue;
            }

            if (msg.role === "user") {
                const textParts: string[] = [];
                const toolResults: ToolResultBlock[] = [];

                for (const block of msg.content as InputMessageContent[]) {
                    if (block.type === "text") {
                        textParts.push(block.text);
                    } else if (block.type === "tool_result") {
                        toolResults.push(block);
                    }
                    // skip thinking blocks — not supported by OpenAI
                }

                if (textParts.length > 0) {
                    result.push({ role: "user", content: textParts.join("\n") });
                }
                for (const tr of toolResults) {
                    result.push({ role: "tool", tool_call_id: tr.tool_use_id, content: tr.content });
                }
            } else if (msg.role === "assistant") {
                const textParts: string[] = [];
                const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];

                for (const block of msg.content as InputMessageContent[]) {
                    if (block.type === "text") {
                        textParts.push((block as TextBlock).text);
                    } else if (block.type === "tool_use") {
                        const tb = block as ToolUseBlock;
                        toolCalls.push({
                            id: tb.id,
                            type: "function",
                            function: { name: tb.name, arguments: JSON.stringify(tb.input) },
                        });
                    }
                    // skip thinking blocks
                }

                result.push({
                    role: "assistant",
                    content: textParts.join("\n") || null,
                    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
                });
            }
        }

        return result;
    }

    private buildTools(tools: ToolParams[]): OpenAI.ChatCompletionTool[] {
        return tools.map(t => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema,
            },
        }));
    }

    stream(request: CanonicalRequest): AssistantMessageEventStream {
        const eventStream = new AssistantMessageEventStream();
        const { config } = this;

        (async () => {
            const openaiStream = await this.client.chat.completions.create({
                model: config.model,
                messages: this.buildMessages(request.messages),
                ...(request.tools && request.tools.length > 0 ? { tools: this.buildTools(request.tools) } : {}),
                ...(config.max_tokens ? { max_tokens: config.max_tokens } : {}),
                ...(config.thinking?.effort ? { reasoning_effort: config.thinking.effort } : {}),
                stream: true,
            });

            const output: AssistantMessage = { role: "assistant", content: [] };
            const toolAccumulators: Map<number, { id: string; name: string; args: string }> = new Map();
            let textIndex = -1;
            let started = false;

            for await (const chunk of openaiStream) {
                const choice = chunk.choices[0];
                if (!choice) continue;

                if (!started) {
                    started = true;
                    eventStream.push({ type: "message_start", text: "" });
                }

                const delta = choice.delta;

                if (delta.content) {
                    if (textIndex === -1) {
                        textIndex = output.content.length;
                        output.content.push({ type: "text", text: "" });
                        eventStream.push({ type: "text_start", index: textIndex });
                    }
                    (output.content[textIndex] as TextBlock).text += delta.content;
                    eventStream.push({ type: "text_delta", index: textIndex, text: delta.content });
                }

                if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        if (!toolAccumulators.has(tc.index)) {
                            toolAccumulators.set(tc.index, { id: tc.id ?? "", name: tc.function?.name ?? "", args: "" });
                            const contentIndex = output.content.length;
                            output.content.push({ type: "tool_use", id: tc.id ?? "", name: tc.function?.name ?? "", input: {} });
                            eventStream.push({ type: "tool_use_start", index: contentIndex, id: tc.id ?? "", name: tc.function?.name ?? "" });
                        }
                        if (tc.function?.arguments) {
                            const acc = toolAccumulators.get(tc.index)!;
                            acc.args += tc.function.arguments;
                            // content index = number of text blocks + tool call's position among tool calls
                            const contentIndex = (textIndex === -1 ? 0 : textIndex + 1) + tc.index;
                            eventStream.push({ type: "tool_input_json_delta", index: contentIndex, partial_json: tc.function.arguments });
                        }
                    }
                }

                if (choice.finish_reason) {
                    output.stop_reason = choice.finish_reason === "tool_calls" ? "tool_use"
                        : choice.finish_reason === "length" ? "max_tokens"
                            : "end_turn";
                }
            }

            // parse accumulated tool call args into input objects
            for (const [idx, acc] of toolAccumulators) {
                const contentIndex = (textIndex === -1 ? 0 : textIndex + 1) + idx;
                const block = output.content[contentIndex] as ToolUseBlock | undefined;
                if (block) {
                    block.input = JSON.parse(acc.args || "{}");
                }
            }

            eventStream.setFinalOutput(output);
            eventStream.close();
        })();

        return eventStream;
    }
}
