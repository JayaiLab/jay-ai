import fs from "fs";
import path from "path";
import os from "os";
import lockfile from "proper-lockfile";
import type { OAuthCredentials } from "@jay-ai/core";

const AUTH_DIR = path.join(os.homedir(), ".jayai");
const AUTH_FILE = path.join(AUTH_DIR, "auth.json");

export interface StoredAuth {
    provider: string;
    credentials: OAuthCredentials;
}

function ensureAuthDir(): void {
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
    }
    if (!fs.existsSync(AUTH_FILE)) {
        fs.writeFileSync(AUTH_FILE, "{}", { mode: 0o600 });
    }
}

export async function saveAuth(auth: StoredAuth): Promise<void> {
    ensureAuthDir();
    let release: (() => Promise<void>) | undefined;
    try {
        release = await lockfile.lock(AUTH_FILE, { retries: 3 });
        fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
    } finally {
        await release?.();
    }
}

export function loadAuth(): StoredAuth | null {
    try {
        const raw = fs.readFileSync(AUTH_FILE, "utf-8");
        const parsed = JSON.parse(raw) as Partial<StoredAuth>;
        if (parsed.provider && parsed.credentials) return parsed as StoredAuth;
    } catch {
        // file missing or malformed
    }
    return null;
}

export function clearAuth(): void {
    try {
        fs.writeFileSync(AUTH_FILE, "{}", { mode: 0o600 });
    } catch {
        // ignore
    }
}
