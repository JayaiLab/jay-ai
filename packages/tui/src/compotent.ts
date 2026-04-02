export interface Component {
    render(width: number): string[];
}

export class Container implements Component {
    children: Component[];
    constructor(children: Component[]) {
        this.children = children;
    }
    addChild(child: Component): void {
        this.children.push(child);
    }
    removeChild(child: Component): void {
        this.children = this.children.filter(c => c !== child);
    }
    render(width: number): string[] {
        const rows: string[] = [];
        for (const child of this.children) {
            const childRows = child.render(width);
            if (childRows.length === 0) continue;
            if (rows.length > 0) rows.push(""); // separator between components
            rows.push(...childRows);
        }
        return rows;
    }
}
