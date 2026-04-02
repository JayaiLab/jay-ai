import fs from "fs";
import type { AgentStreamEvent } from "@jay-ai/agent";

const DEFAULT_FIXTURE = `${import.meta.dirname}/terminal-stream.jsonl`;
export async function* mockStream(
    fixture: string = DEFAULT_FIXTURE,
): AsyncGenerator<AgentStreamEvent> {
    const lines = fs.readFileSync(fixture, "utf-8").split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
            yield JSON.parse(trimmed) as AgentStreamEvent;
        }
    }
}
