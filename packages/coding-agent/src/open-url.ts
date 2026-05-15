import { spawn } from "child_process";

/**
 * Open a URL in the user's default browser. Detaches the child so the CLI
 * doesn't wait on it and swallows failures (the URL is still printed for the
 * user to copy manually).
 */
export function openUrl(url: string): void {
    let cmd: string;
    let args: string[];
    if (process.platform === "darwin") {
        cmd = "open";
        args = [url];
    } else if (process.platform === "win32") {
        cmd = "cmd";
        args = ["/c", "start", "", url];
    } else {
        cmd = "xdg-open";
        args = [url];
    }
    try {
        const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
        child.on("error", () => { /* user can still copy the URL */ });
        child.unref();
    } catch {
        // No browser available — fall through silently.
    }
}
