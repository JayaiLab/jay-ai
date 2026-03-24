import { Anthropic } from "@anthropic-ai/sdk";
import { AssistantMessageEventStream } from "../event-stream";
import { AssistantMessage, TextBlock, ThinkingBlock, ThinkingEffort, ToolUseBlock } from "../types/messages";
import { CanonicalRequest, LLMProvider, ModelConfig } from "../types/model";

const DEFAULT_MAX_TOKENS = 200000;

// Models that support adaptive thinking via output_config.effort
const ADAPTIVE_THINKING_MODELS = [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-opus-4-5",
];

const BUDGET_TOKENS: Record<string, number> = {
    minimal: 1024,
    low: 2000,
    medium: 8000,
    high: 16000,
    xhigh: 16000,
};

// Internal type for accumulating streamed tool input JSON
interface ToolBlockAccumulator extends ToolUseBlock {
    input_json: string;
}

export class AnthropicProvider implements LLMProvider {
    private client: Anthropic;

    constructor(private config: ModelConfig) {
        this.client = new Anthropic(
            config.authToken
                ? {
                      apiKey: null,
                      authToken: config.authToken,
                      defaultHeaders: {
                          "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
                          "user-agent": "claude-cli/1.0.0",
                          "x-app": "cli",
                      },
                  }
                : { apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY }
        );
    }

    stream(request: CanonicalRequest): AssistantMessageEventStream {
        const eventStream = new AssistantMessageEventStream();
        const { config } = this;
        const maxTokens = config.max_tokens ?? DEFAULT_MAX_TOKENS;
        const effort = config.thinking?.effort;
        const supportsAdaptive = ADAPTIVE_THINKING_MODELS.some(m => config.model.startsWith(m));
        const thinkingConfig = effort && effort !== "none"
            ? supportsAdaptive
                ? { thinking: { type: "adaptive" as const }, output_config: { effort: this.mapAdaptiveEffort(effort) } }
                : { thinking: { type: "enabled" as const, budget_tokens: BUDGET_TOKENS[effort] } }
            : {};

        (async () => {
            const systemBlocks: Anthropic.Messages.TextBlockParam[] = [];
            if (config.authToken) {
                systemBlocks.push({ type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." });
            }
            if (config.system) {
                systemBlocks.push({ type: "text", text: config.system });
            }
            const system = systemBlocks.length > 0 ? systemBlocks : undefined;

            const anthropicStream = this.client.messages.stream({
                model: config.model,
                system,
                messages: request.messages as Parameters<typeof this.client.messages.stream>[0]["messages"],
                tools: request.tools?.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
                max_tokens: maxTokens,
                stream: true,
                ...thinkingConfig,
            });

            const output: AssistantMessage = { role: "assistant", content: [] };

            for await (const event of anthropicStream) {
                if (event.type === "message_start") {
                    eventStream.push({ type: "message_start", snapshot: output });
                } else if (event.type === "content_block_start") {
                    if (event.content_block.type === "text") {
                        output.content.push({ type: "text", text: "" });
                        eventStream.push({ type: "text_start", index: event.index, snapshot: output });
                    } else if (event.content_block.type === "thinking") {
                        output.content.push({ type: "thinking", thinking: "", signature: "" });
                        eventStream.push({ type: "thinking_start", index: event.index, snapshot: output });
                    } else if (event.content_block.type === "tool_use") {
                        output.content.push({
                            type: "tool_use",
                            id: event.content_block.id,
                            name: event.content_block.name,
                            input: {},
                            input_json: "",
                        } as ToolBlockAccumulator);
                        eventStream.push({ type: "tool_use_start", index: event.index, id: event.content_block.id, name: event.content_block.name, snapshot: output });
                    }
                } else if (event.type === "content_block_delta") {
                    if (event.delta.type === "text_delta") {
                        (output.content[event.index] as TextBlock).text += event.delta.text;
                        eventStream.push({ type: "text_delta", index: event.index, text: event.delta.text, snapshot: output });
                    } else if (event.delta.type === "thinking_delta") {
                        (output.content[event.index] as ThinkingBlock).thinking += event.delta.thinking;
                        eventStream.push({ type: "thinking_delta", index: event.index, thinking: event.delta.thinking, snapshot: output });
                    } else if (event.delta.type === "signature_delta") {
                        (output.content[event.index] as ThinkingBlock).signature += event.delta.signature;
                        eventStream.push({ type: "signature_delta", index: event.index, signature: event.delta.signature, snapshot: output });
                    } else if (event.delta.type === "input_json_delta") {
                        (output.content[event.index] as ToolBlockAccumulator).input_json += event.delta.partial_json;
                        eventStream.push({ type: "tool_input_json_delta", index: event.index, partial_json: event.delta.partial_json, snapshot: output });
                    }
                } else if (event.type === "content_block_stop") {
                    const block = output.content[event.index];
                    if (block.type === "tool_use") {
                        block.input = JSON.parse((block as ToolBlockAccumulator).input_json);
                        (block as Partial<ToolBlockAccumulator>).input_json = undefined;
                    } else if (block.type === "thinking") {
                        eventStream.push({ type: "thinking_end", index: event.index, snapshot: output });
                    } else if (block.type === "text") {
                        eventStream.push({ type: "text_end", index: event.index, snapshot: output });
                    }
                } else if (event.type === "message_delta") {
                    output.stop_reason = event.delta.stop_reason as AssistantMessage["stop_reason"];
                } else if (event.type === "message_stop") {
                    eventStream.push({ type: "message_end", output, snapshot: output });
                    eventStream.setFinalOutput(output);
                    eventStream.close();
                }
            }
        })();

        return eventStream;
    }

    private mapAdaptiveEffort(effort: ThinkingEffort): "low" | "medium" | "high" | "max" {
        switch (effort) {
            case "minimal":
            case "low": return "low";
            case "medium": return "medium";
            case "high": return "high";
            case "xhigh": return "max";
            default: return "medium";
        }
    }
}
