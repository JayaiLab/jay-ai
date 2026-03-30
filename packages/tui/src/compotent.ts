export interface Component {
    render(): string;
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
    render(): string {
        return this.children.map(child => child.render()).join("\n");
    }
}