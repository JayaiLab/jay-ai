import fs from "fs";

const logStream = fs.createWriteStream("/tmp/jayai-debug.log", { flags: "w" });

export function debugLog(...args: unknown[]): void {
    logStream.write(args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") + "\n");
}
