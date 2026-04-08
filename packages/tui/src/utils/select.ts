import { Terminal } from "../terminal";

export interface SelectOption {
    label: string;
    description?: string;
}

function renderMenu(terminal: Terminal, options: SelectOption[], selected: number): void {
    terminal.write(`\x1b[${options.length}A`);
    const lines = options.map((o, i) => {
        const cursor = i === selected ? "> " : "  ";
        const desc = o.description ? `  ${o.description}` : "";
        const color = i === selected ? "\x1b[34m" : "\x1b[90m";
        return `${color}${cursor}${o.label}${desc}\x1b[0m`;
    });
    terminal.write(lines.map(l => `\r${l}\x1b[K`).join("\n") + "\n");
}

export function selectFromOptions(terminal: Terminal, options: SelectOption[]): Promise<number> {
    let selected = 0;

    terminal.write("Use ↑↓ to navigate, Enter to confirm:\n\n");
    const lines = options.map((o, i) => {
        const cursor = i === selected ? "> " : "  ";
        const desc = o.description ? `  ${o.description}` : "";
        const color = i === selected ? "\x1b[34m" : "\x1b[90m";
        return `${color}${cursor}${o.label}${desc}\x1b[0m`;
    });
    terminal.write(lines.join("\n") + "\n");

    return new Promise((resolve) => {
        terminal.setDataHandler((key) => {
            if (key === "\x1b[A") { // up
                selected = (selected - 1 + options.length) % options.length;
                renderMenu(terminal, options, selected);
            } else if (key === "\x1b[B") { // down
                selected = (selected + 1) % options.length;
                renderMenu(terminal, options, selected);
            } else if (key === "\r") { // enter
                terminal.write("\n");
                resolve(selected);
            }
        });
    });
}
