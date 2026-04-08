import fs from "fs";
import path from "path";
import os from "os";

const SETTINGS_FILE = path.join(os.homedir(), ".jayai", "settings.json");

export interface Settings {
    model?: string;
    modelProvider?: string;
}

export function loadSettings(): Settings {
    try {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
        return JSON.parse(raw) as Settings;
    } catch {
        return {};
    }
}

export function saveSettings(settings: Settings): void {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), { mode: 0o600 });
}
