// Minimal XML parser, enough for JCloisterZone's tile files (no namespaces, CDATA or entities).
export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  text: string;
}

export function parseXml(src: string): XNode {
  const root: XNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XNode[] = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const [, closing, name, rest, selfClose, text] = m;
    const top = stack[stack.length - 1]!;
    if (text !== undefined) {
      top.text += text;
    } else if (name !== undefined) {
      if (closing) {
        if (stack.length < 2 || top.name !== name) throw new Error(`Oväntad sluttagg </${name}>`);
        stack.pop();
      } else {
        const attrs: Record<string, string> = {};
        for (const a of (rest ?? "").matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]!] = a[2]!;
        const node: XNode = { name, attrs, children: [], text: "" };
        top.children.push(node);
        if (!selfClose) stack.push(node);
      }
    }
  }
  if (stack.length !== 1) throw new Error("Oavslutad tagg i XML");
  return root;
}

/** Alla ättlingar med givet namn, i dokumentordning. */
export function findAll(n: XNode, name: string): XNode[] {
  const out: XNode[] = [];
  for (const c of n.children) {
    if (c.name === name) out.push(c);
    out.push(...findAll(c, name));
  }
  return out;
}
