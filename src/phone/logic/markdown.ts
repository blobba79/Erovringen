// Läser den lilla Markdown-delmängden i regeltexterna: # och ## rubriker,
// stycken, "- " listor och **fetstil**. Ger data, aldrig HTML.

export interface Inline {
  text: string;
  bold: boolean;
}

export type Block =
  | { type: "h1" | "h2"; inline: Inline[] }
  | { type: "p"; inline: Inline[] }
  | { type: "ul"; items: Inline[][] };

export function parseInline(src: string): Inline[] {
  const parts = src.split("**");
  const out: Inline[] = [];
  // Med jämnt antal delar finns en ensam ** utan par: den blir vanlig text.
  const balanced = parts.length % 2 === 1;
  parts.forEach((text, i) => {
    const bold = balanced && i % 2 === 1;
    const t = !balanced && i < parts.length - 1 ? text + "**" : text;
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.bold === bold) last.text += t;
    else out.push({ text: t, bold });
  });
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;
  const flush = () => {
    if (para.length > 0) blocks.push({ type: "p", inline: parseInline(para.join(" ")) });
    para = [];
    list = null;
  };
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flush();
      continue;
    }
    const h = /^(#{1,2})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: h[1] === "#" ? "h1" : "h2", inline: parseInline(h[2] ?? "") });
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (para.length > 0) flush();
      if (!list) {
        list = [];
        blocks.push({ type: "ul", items: list });
      }
      list.push(parseInline(li[1] ?? ""));
      continue;
    }
    if (list) {
      // Fortsättningsrad i ett listobjekt.
      const items: Inline[][] = list;
      const last = items[items.length - 1];
      if (last) last.push(...parseInline(" " + line));
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}
