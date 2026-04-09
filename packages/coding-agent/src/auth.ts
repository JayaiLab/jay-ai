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

/** All stored provider credentials, keyed by provider ID. */
export type StoredAuthMap = Record<string, OAuthCredentials>;

function ensureAuthDir(): void {
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
    }
    if (!fs.existsSync(AUTH_FILE)) {
        fs.writeFileSync(AUTH_FILE, "{}", { mode: 0o600 });
    }
}

/** Migrate old single-provider format to multi-provider map. */
function migrateIfNeeded(parsed: unknown): StoredAuthMap {
    if (!parsed || typeof parsed !== "object") return {};
    const obj = parsed as Record<string, unknown>;
    // Old format: { provider: "anthropic", credentials: {...} }
    if (typeof obj.provider === "string" && obj.credentials && typeof obj.credentials === "object") {
        return { [obj.provider]: obj.credentials as OAuthCredentials };
    }
    // Already new format
    return obj as StoredAuthMap;
}

export async function saveAuth(auth: StoredAuth): Promise<void> {
    ensureAuthDir();
    let release: (() => Promise<void>) | undefined;
    try {
        release = await lockfile.lock(AUTH_FILE, { retries: 3 });
        const existing = loadAllAuth();
        existing[auth.provider] = auth.credentials;
        fs.writeFileSync(AUTH_FILE, JSON.stringify(existing, null, 2), { mode: 0o600 });
    } finally {
        await release?.();
    }
}

/** Load all stored provider credentials. */
export function loadAllAuth(): StoredAuthMap {
    try {
        const raw = fs.readFileSync(AUTH_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return migrateIfNeeded(parsed);
    } catch {
        return {};
    }
}

/** Load credentials for a specific provider. */
export function loadAuth(providerId: string): StoredAuth | null {
    const all = loadAllAuth();
    const credentials = all[providerId];
    if (!credentials?.access) return null;
    return { provider: providerId, credentials };
}

export function clearAuth(): void {
    try {
        fs.writeFileSync(AUTH_FILE, "{}", { mode: 0o600 });
    } catch {
        // ignore
    }
}
