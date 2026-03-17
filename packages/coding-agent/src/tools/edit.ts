import * as fs from "fs";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@jay-ai/agent";
import { resolveToCwd } from "./path-utils";

const Input = Type.Object({
    path: Type.String({ description: "The file path to edit." }),
    old_string: Type.String({ description: "The exact string to find and replace. Must appear in the file." }),
    new_string: Type.String({ description: "The string to replace it with." }),
    replace_all: Type.Optional(Type.Boolean({ description: "Replace all occurrences. Defaults to false, which requires old_string to appear exactly once." })),
    description: Type.Optional(Type.String({ description: "Short human-readable label for this operation, e.g. 'Fix import path'." })),
});

type Input = Static<typeof Input>;

export function createEditTool(cwd: string): AgentTool<Input> {
    return {
        name: "edit",
        description: "Edit a file by replacing an exact string with a new string. Errors if old_string is not found or appears more than once (unless replace_all is true).",
        input_schema: Input,
        func: (input) => {
            const filePath = resolveToCwd(input.path, cwd);

            let content: string;
            try {
                content = fs.readFileSync(filePath, "utf-8");
            } catch (err: unknown) {
                return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
            }

            const count = content.split(input.old_string).length - 1;

            if (count === 0) {
                return `Error: old_string not found in ${filePath}`;
            }

            if (count > 1 && !input.replace_all) {
                return `Error: old_string appears ${count} times in ${filePath}. Set replace_all: true to replace all occurrences, or provide a more specific string.`;
            }

            const newContent = input.replace_all
                ? content.split(input.old_string).join(input.new_string)
                : content.replace(input.old_string, input.new_string);

            try {
                fs.writeFileSync(filePath, newContent, "utf-8");
            } catch (err: unknown) {
                return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
            }

            return input.replace_all
                ? `Successfully edited ${filePath} (replaced ${count} occurrence${count !== 1 ? "s" : ""})`
                : `Successfully edited ${filePath}`;
        },
    };
}

const editTool = createEditTool(process.cwd());
export default editTool;
