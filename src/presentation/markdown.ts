export const md = (s: string) =>
  s.replace(/\r\n?|\n/g, "\n").replace(/[&<>|\\`*_[\]#\n]/g, (c) => {
    const escaped: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "|": "&#124;", "\n": "<br>",
    };
    return escaped[c] ?? `&#${c.codePointAt(0)};`;
  });
export const anchor = (id: string) => "rule-" + Buffer.from(id).toString("hex");
export const finish = (lines: string[]) =>
  lines.join("\n").replace(/\n*$/, "") + "\n";
