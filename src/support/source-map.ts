type Location = { path: string; line: number; column: number };
export class SourceMap {
  private locations = new Map<string, Location>();
  private elements = new Map<string, (string | number)[]>();
  constructor(public readonly file: string) {}
  set(parts: (string | number)[], loc: Location) {
    this.locations.set(JSON.stringify(parts), loc);
  }
  bind(kind: string, id: string, parts: (string | number)[]) {
    this.elements.set(JSON.stringify([kind, id]), parts);
  }
  get(parts: (string | number)[]): Location | undefined {
    for (let p = parts; ; p = p.slice(0, -1)) {
      const loc = this.locations.get(JSON.stringify(p));
      if (loc) return loc;
      if (!p.length) return undefined;
    }
  }
  element(kind: string, id: string, property: (string | number)[] = []) {
    const p = this.elements.get(JSON.stringify([kind, id]));
    return p ? this.get([...p, ...property]) : undefined;
  }
}
