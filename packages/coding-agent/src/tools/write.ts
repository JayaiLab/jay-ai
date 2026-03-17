import * as fs from "fs";
import * as path from "path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@jay-ai/agent";
import { resolveToCwd } from "./path-utils";

const Input = Type.Object({
    path: Type.String({ description: "The file path to write (relative, absolute, or starting with ~)." }),
    content: Type.String({ description: "The full content to write to the file." }),
    description: Type.Optional(Type.String({ description: "Short human-readable label for this operation, e.g. 'Create config file'." })),
});

type Input = Static<typeof Input>;

export function createWriteTool(cwd: string): AgentTool<Input> {
    return {
        name: "write",
        description: "Write content to a file, creating it (and any missing parent directories) if it doesn't exist, or overwriting it if it does.",
        input_schema: Input,
        func: (input) => {
            try {
                const filePath = resolveToCwd(input.path, cwd);
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                const contentBuffer = Buffer.from(input.content, "utf-8");
                fs.writeFileSync(filePath, contentBuffer);
                return `Successfully wrote ${contentBuffer.length} bytes to ${filePath}`;
            } catch (err: unknown) {
                return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    };
}

const writeTool = createWriteTool(process.cwd());
export default writeTool;
