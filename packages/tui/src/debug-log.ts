import fs from "fs";

let logStream: fs.WriteStream | null = null;

export function enableDebugLog(): void {
    if (!logStream) {
        logStream = fs.createWriteStream("/tmp/jayai-debug.log", { flags: "w" });
    }
}

export function debugLog(...args: unknown[]): void {
    if (!logStream) return;
    logStream.write(args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") + "\n");
}
