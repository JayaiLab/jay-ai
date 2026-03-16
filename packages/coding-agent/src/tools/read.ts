import * as fs from "fs";
import * as path from "path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@jay-ai/agent";
import type { DocumentBlock, DocumentMediaType, ImageBlock } from "@jay-ai/core";
import { resolveReadPath } from "./path-utils";

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024;        // 50KB — text file truncation limit
const MAX_BINARY_BYTES = 50 * 1024 * 1024;  // 50MB — API limit for documents/images

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const IMAGE_EXTENSIONS: Record<string, ImageMediaType> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
};

const DOCUMENT_EXTENSIONS: Record<string, DocumentMediaType> = {
    // PDF
    ".pdf": "application/pdf",
    // Excel
    ".xla": "application/vnd.ms-excel",
    ".xlb": "application/vnd.ms-excel",
    ".xlc": "application/vnd.ms-excel",
    ".xlm": "application/vnd.ms-excel",
    ".xls": "application/vnd.ms-excel",
    ".xlt": "application/vnd.ms-excel",
    ".xlw": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // CSV / TSV / IIF
    ".csv": "text/csv",
    ".tsv": "text/tsv",
    ".iif": "application/x-iif",
    // Word / rich docs
    ".doc": "application/msword",
    ".dot": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".rtf": "application/rtf",
    ".pages": "application/vnd.apple.pages",
    // Presentations
    ".pot": "application/vnd.ms-powerpoint",
    ".ppa": "application/vnd.ms-powerpoint",
    ".pps": "application/vnd.ms-powerpoint",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pwz": "application/vnd.ms-powerpoint",
    ".wiz": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".key": "application/vnd.apple.keynote",
};

const Input = Type.Object({
    path: Type.String({ description: "The file path to read (relative, absolute, or starting with ~)." }),
    offset: Type.Optional(Type.Number({ description: "The line number to start reading from (0-indexed). Defaults to 0." })),
    limit: Type.Optional(Type.Number({ description: `The maximum number of lines to read. Defaults to ${DEFAULT_MAX_LINES}.` })),
    description: Type.Optional(Type.String({ description: "Short human-readable label for what this file does, e.g. 'README.md'." })),
});

type Input = Static<typeof Input>;

function createReadTool(cwd: string): AgentTool<Input> {
    return {
        name: "read",
        description: "Read the contents of a file at the given path. Accepts relative paths, absolute paths, and ~ home expansion.",
        input_schema: Input,
        func: (input) => {
            const filePath = resolveReadPath(input.path, cwd);
            const ext = path.extname(filePath).toLowerCase();

            const docMediaType = DOCUMENT_EXTENSIONS[ext];
            if (docMediaType) {
                return readDocument(filePath, docMediaType);
            }

            const imageMediaType = IMAGE_EXTENSIONS[ext];
            if (imageMediaType) {
                return readImage(filePath, imageMediaType);
            }

            return readText(filePath, input.offset ?? 0, input.limit ?? DEFAULT_MAX_LINES);
        },
    };
}

function checkBinarySize(filePath: string): void {
    const { size } = fs.statSync(filePath);
    if (size > MAX_BINARY_BYTES) {
        const mb = (size / (1024 * 1024)).toFixed(1);
        throw new Error(`File is too large (${mb} MB). Maximum allowed size is 50 MB.`);
    }
}

function readDocument(filePath: string, media_type: DocumentMediaType): DocumentBlock[] {
    checkBinarySize(filePath);
    let data: string;
    try {
        data = fs.readFileSync(filePath).toString("base64");
    } catch (err: unknown) {
        throw new Error(`Error reading file: ${err instanceof Error ? err.message : String(err)}`);
    }
    return [{ type: "document", source: { type: "base64", media_type, data }, filename: path.basename(filePath) }];
}

function readImage(filePath: string, media_type: ImageMediaType): ImageBlock[] {
    checkBinarySize(filePath);
    let data: string;
    try {
        data = fs.readFileSync(filePath).toString("base64");
    } catch (err: unknown) {
        throw new Error(`Error reading image: ${err instanceof Error ? err.message : String(err)}`);
    }
    return [{ type: "image", source: { type: "base64", data, media_type } }];
}

function readText(filePath: string, offset: number, limit: number): string {
    let fd: number;
    try {
        fd = fs.openSync(filePath, "r");
    } catch (err: unknown) {
        return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
    }

    try {
        const { size } = fs.fstatSync(fd);
        const readSize = Math.min(size, DEFAULT_MAX_BYTES);
        const buffer = Buffer.alloc(readSize);
        fs.readSync(fd, buffer, 0, readSize, 0);

        // quick binary sniff — null byte almost always means binary
        if (buffer.subarray(0, 8192).includes(0x00)) {
            return `Error: ${filePath} appears to be a binary file and cannot be read as text.`;
        }

        const allLines = buffer.toString("utf-8").split("\n");
        const sliced = allLines.slice(offset, offset + limit);
        const remaining = allLines.length - (offset + sliced.length);

        let result = sliced.join("\n");
        if (remaining > 0 || size > DEFAULT_MAX_BYTES) {
            result += `\n[File truncated: ${remaining} lines remaining. Use offset=${offset + sliced.length} to continue reading.]`;
        }
        return result;
    } finally {
        fs.closeSync(fd);
    }
}

const readTool = createReadTool(process.cwd());
export default readTool;