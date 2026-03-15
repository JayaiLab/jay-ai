import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, ToolCallContext } from "@jay-ai/agent";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB — output truncation threshold

const Input = Type.Object({
    command: Type.String({ description: "The bash command to execute." }),
    description: Type.Optional(Type.String({ description: "Short human-readable label for what this command does, e.g. 'Build all packages'." })),
    timeout: Type.Optional(Type.Number({ description: `Timeout in milliseconds. Defaults to ${DEFAULT_TIMEOUT_MS}.` })),
});

type Input = Static<typeof Input>;

export interface BashOperations {
    spawnHook?: (
        command: string,
        cwd: string,
        env: NodeJS.ProcessEnv,
    ) => { command: string; cwd: string; env: NodeJS.ProcessEnv };
}

export interface BashToolOptions {
    commandPrefix?: string;
    operations?: BashOperations;
}

function killProcessTree(pid: number): void {
    try {
        process.kill(-pid, "SIGKILL");
    } catch {
        // Process may have already exited
    }
}

function truncateTail(text: string, maxBytes: number, tempFile?: string): string {
    const buf = Buffer.from(text, "utf-8");
    if (buf.length <= maxBytes) return text;

    const tail = buf.subarray(buf.length - maxBytes);
    // Skip partial first line to avoid garbled UTF-8 / mid-line start
    const newlineIdx = tail.indexOf(0x0a);
    const trimmed = newlineIdx >= 0 ? tail.subarray(newlineIdx + 1) : tail;

    const skippedBytes = buf.length - tail.length + (newlineIdx >= 0 ? newlineIdx + 1 : 0);
    const skippedText = buf.subarray(0, skippedBytes).toString("utf-8");
    const skippedLines = (skippedText.match(/\n/g) ?? []).length;

    let header = `[Output truncated: ${skippedLines} lines omitted from the beginning.`;
    if (tempFile) header += ` Full output saved to ${tempFile}.`;
    header += "]\n";

    return header + trimmed.toString("utf-8");
}

export function createBashTool(cwd: string, options: BashToolOptions = {}): AgentTool<Input> {
    return {
        name: "bash",
        description: "Execute a bash command and return its output. Runs in the working directory of the agent.",
        input_schema: Input,
        func: (input: Input, context?: ToolCallContext) => new Promise<string>((resolve, reject) => {
            const timeoutMs = input.timeout ?? DEFAULT_TIMEOUT_MS;
            let command = input.command;
            if (options.commandPrefix) {
                command = `${options.commandPrefix} ${command}`;
            }

            let resolvedCwd = cwd;
            let env = { ...process.env };

            if (options.operations?.spawnHook) {
                const result = options.operations.spawnHook(command, resolvedCwd, env);
                command = result.command;
                resolvedCwd = result.cwd;
                env = result.env;
            }

            const tempFile = path.join(os.tmpdir(), `jay-bash-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
            let tempFileStream: fs.WriteStream | null = null;
            let rollingBuffer = "";
            let spilledToFile = false;
            let timedOut = false;

            const child = spawn("bash", ["-c", command], {
                cwd: resolvedCwd,
                env,
                detached: true,
                stdio: ["ignore", "pipe", "pipe"],
            });

            function handleChunk(chunk: Buffer): void {
                const text = chunk.toString("utf-8");
                context?.onUpdate?.(text);

                if (!spilledToFile && Buffer.byteLength(rollingBuffer + text, "utf-8") > DEFAULT_MAX_BYTES * 2) {
                    // Spill everything to temp file from now on
                    spilledToFile = true;
                    tempFileStream = fs.createWriteStream(tempFile, { flags: "a" });
                    tempFileStream.write(rollingBuffer);
                }

                if (spilledToFile && tempFileStream) {
                    tempFileStream.write(text);
                } else {
                    rollingBuffer += text;
                    // Keep rolling buffer capped at 2x max
                    const bufBytes = Buffer.byteLength(rollingBuffer, "utf-8");
                    if (bufBytes > DEFAULT_MAX_BYTES * 2) {
                        const raw = Buffer.from(rollingBuffer, "utf-8");
                        const trimmed = raw.subarray(raw.length - DEFAULT_MAX_BYTES * 2);
                        // find next newline to avoid partial line
                        const nl = trimmed.indexOf(0x0a);
                        rollingBuffer = nl >= 0
                            ? trimmed.subarray(nl + 1).toString("utf-8")
                            : trimmed.toString("utf-8");
                    }
                }
            }

            child.stdout.on("data", handleChunk);
            child.stderr.on("data", handleChunk);

            const timer = setTimeout(() => {
                timedOut = true;
                if (child.pid !== undefined) killProcessTree(child.pid);
            }, timeoutMs);

            child.on("close", (code) => {
                clearTimeout(timer);

                function finish(output: string): void {
                    const truncated = truncateTail(output, DEFAULT_MAX_BYTES, spilledToFile ? tempFile : undefined);
                    if (timedOut) {
                        reject(new Error(`Command timed out after ${timeoutMs}ms.\n${truncated}`));
                    } else if (code !== 0 && code !== null) {
                        reject(new Error(`Exit code ${code}:\n${truncated}`));
                    } else {
                        resolve(truncated || "(no output)");
                    }
                }

                if (tempFileStream) {
                    tempFileStream.end(() => {
                        try {
                            const full = fs.readFileSync(tempFile, "utf-8");
                            finish(full);
                        } catch {
                            finish(rollingBuffer);
                        }
                    });
                } else {
                    finish(rollingBuffer);
                }
            });

            child.on("error", (err) => {
                clearTimeout(timer);
                reject(new Error(`Failed to start process: ${err.message}`));
            });
        }),
    };
}

const bashTool = createBashTool(process.cwd());
export default bashTool;
