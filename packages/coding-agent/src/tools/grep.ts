import * as fs from "fs";
import * as path from "path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@jay-ai/agent";
import { resolveToCwd } from "./path-utils";

const DEFAULT_MAX_RESULTS = 100;

const Input = Type.Object({
    pattern: Type.String({ description: "The regex pattern to search for." }),
    path: Type.Optional(Type.String({ description: "File or directory to search in. Defaults to the working directory." })),
    glob: Type.Optional(Type.String({ description: "Glob pattern to filter files, e.g. '*.ts' or '**/*.json'. Only used when searching a directory." })),
    case_insensitive: Type.Optional(Type.Boolean({ description: "Case-insensitive search. Defaults to false." })),
    context: Type.Optional(Type.Number({ description: "Number of lines to show before and after each match (like grep -C)." })),
    max_results: Type.Optional(Type.Number({ description: `Maximum number of matching lines to return. Defaults to ${DEFAULT_MAX_RESULTS}.` })),
    description: Type.Optional(Type.String({ description: "Short human-readable label for this operation, e.g. 'Find all TODO comments'." })),
});

type Input = Static<typeof Input>;

interface Match {
    file: string;
    line: number;  // 1-indexed
    text: string;
}

/** Convert a glob pattern like "*.ts" or "**\/*.ts" to a RegExp. */
function globToRegex(glob: string): RegExp {
    const escaped = glob
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")  // escape regex special chars except * and ?
        .replace(/\*\*/g, "\x00")               // temporarily replace ** with placeholder
        .replace(/\*/g, "[^/]*")                // * matches anything except /
        .replace(/\x00/g, ".*")                 // ** matches anything including /
        .replace(/\?/g, "[^/]");                // ? matches any single char except /
    return new RegExp(`(^|/)${escaped}$`);
}

function walkDir(dir: string, globRegex: RegExp | null, results: string[]): void {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;  // skip hidden files/dirs
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(fullPath, globRegex, results);
        } else if (entry.isFile()) {
            if (!globRegex || globRegex.test(fullPath)) {
                results.push(fullPath);
            }
        }
    }
}

function searchFile(filePath: string, regex: RegExp, contextLines: number): Match[] {
    let content: string;
    try {
        // Quick binary sniff — skip binary files
        const fd = fs.openSync(filePath, "r");
        const sniff = Buffer.alloc(8192);
        const bytesRead = fs.readSync(fd, sniff, 0, 8192, 0);
        fs.closeSync(fd);
        if (sniff.subarray(0, bytesRead).includes(0x00)) return [];
        content = fs.readFileSync(filePath, "utf-8");
    } catch {
        return [];
    }

    const lines = content.split("\n");
    const matches: Match[] = [];

    for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
            if (contextLines > 0) {
                const start = Math.max(0, i - contextLines);
                const end = Math.min(lines.length - 1, i + contextLines);
                for (let j = start; j <= end; j++) {
                    // Avoid duplicate context lines from adjacent matches
                    if (!matches.length || matches[matches.length - 1].line < j + 1) {
                        matches.push({ file: filePath, line: j + 1, text: lines[j] });
                    }
                }
            } else {
                matches.push({ file: filePath, line: i + 1, text: lines[i] });
            }
        }
    }

    return matches;
}

function formatMatches(matches: Match[], searchRoot: string, contextLines: number): string {
    if (matches.length === 0) return "(no matches)";

    const lines: string[] = [];
    let prevFile: string | null = null;
    let prevLine = -1;

    for (const m of matches) {
        const relFile = path.relative(searchRoot, m.file);
        if (m.file !== prevFile) {
            if (prevFile !== null) lines.push("--");
            prevFile = m.file;
        } else if (contextLines > 0 && m.line > prevLine + 1) {
            lines.push("--");
        }
        lines.push(`${relFile}:${m.line}:${m.text}`);
        prevLine = m.line;
    }

    return lines.join("\n");
}

export function createGrepTool(cwd: string): AgentTool<Input> {
    return {
        name: "grep",
        description: "Search for a regex pattern in files. Returns matching lines with file path and line number.",
        input_schema: Input,
        func: (input) => {
            const searchPath = input.path ? resolveToCwd(input.path, cwd) : cwd;
            const maxResults = input.max_results ?? DEFAULT_MAX_RESULTS;
            const contextLines = input.context ?? 0;

            let regex: RegExp;
            try {
                regex = new RegExp(input.pattern, input.case_insensitive ? "i" : "");
            } catch (err: unknown) {
                return `Error: invalid regex pattern: ${err instanceof Error ? err.message : String(err)}`;
            }

            const globRegex = input.glob ? globToRegex(input.glob) : null;

            // Collect files to search
            let files: string[];
            try {
                const stat = fs.statSync(searchPath);
                if (stat.isFile()) {
                    files = [searchPath];
                } else {
                    files = [];
                    walkDir(searchPath, globRegex, files);
                }
            } catch (err: unknown) {
                return `Error: ${err instanceof Error ? err.message : String(err)}`;
            }

            // Search files, stopping when maxResults is reached
            const allMatches: Match[] = [];
            let truncated = false;
            for (const file of files) {
                const fileMatches = searchFile(file, regex, contextLines);
                for (const m of fileMatches) {
                    allMatches.push(m);
                    if (allMatches.length >= maxResults) {
                        truncated = true;
                        break;
                    }
                }
                if (truncated) break;
            }

            const output = formatMatches(allMatches, searchPath, contextLines);
            return truncated ? `${output}\n\n[Results truncated at ${maxResults} matches]` : output;
        },
    };
}

const grepTool = createGrepTool(process.cwd());
export default grepTool;
