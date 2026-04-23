import { Component } from "../compotent";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 120;
const KEYWORD_ROTATE_TICKS = 50;

const KEYWORDS = [
    "thinking",
    "pondering",
    "contemplating",
    "reasoning",
    "reflecting",
    "considering",
    "processing",
    "mulling",
    "deliberating",
    "analyzing",
];

export class LoaderComponent implements Component {
    private visible: boolean = false;
    private frame: number = 0;
    private tick: number = 0;
    private keyword: string = "";
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly onUpdate: () => void) { }

    private scheduleTick(): void {
        this.timer = setTimeout(() => {
            this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
            this.tick++;
            if (this.tick % KEYWORD_ROTATE_TICKS === 0) {
                this.keyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
            }
            this.onUpdate();
            if (this.visible) this.scheduleTick();
        }, SPINNER_INTERVAL_MS);
    }

    start(): void {
        this.keyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
        this.frame = 0;
        this.tick = 0;
        this.visible = true;
        this.scheduleTick();
    }

    stop(): void {
        this.visible = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    render(_width: number): string[] {
        if (!this.visible) return [];
        const spinner = SPINNER_FRAMES[this.frame];
        return [`\x1b[90m${spinner} ${this.keyword}...\x1b[0m`];
    }
}
