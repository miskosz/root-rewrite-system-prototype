import { KEYWORDS } from "./tokenizer";

export type TokenClass =
  | "keyword"
  | "constructor"
  | "variable"
  | "alias"
  | "typevar"
  | "comment"
  | "operator";

export interface ClassifiedToken {
  start: number;
  end: number;
  cls: TokenClass;
}

function collectAliasNames(source: string): Set<string> {
  const names = new Set<string>();
  const re = /\btype\s+([A-Z][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*:\s*(?:#[^\n]*\n\s*)*([A-Z][A-Za-z0-9_]*)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[2] !== m[1]) names.add(m[1]);
  }
  const openRe = /\bopen\s+type\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  while ((m = openRe.exec(source)) !== null) names.add(m[1]);
  return names;
}

export function classify(source: string): ClassifiedToken[] {
  const aliases = collectAliasNames(source);
  const out: ClassifiedToken[] = [];
  let i = 0;
  const push = (start: number, end: number, cls: TokenClass) =>
    out.push({ start, end, cls });

  while (i < source.length) {
    const c = source[i];

    if (c === "#") {
      let end = i;
      while (end < source.length && source[end] !== "\n") end++;
      push(i, end, "comment");
      i = end;
      continue;
    }

    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      i++;
      continue;
    }

    if (c === "-" && source[i + 1] === ">") {
      push(i, i + 2, "operator");
      i += 2;
      continue;
    }

    if (c === ":" && source[i + 1] === ":") {
      push(i, i + 2, "operator");
      i += 2;
      continue;
    }

    if (c === "|" || c === ":" || c === "," || c === "<" || c === ">") {
      push(i, i + 1, "operator");
      i++;
      continue;
    }

    if (c === "(" || c === ")") {
      i++;
      continue;
    }

    if (c === "'" && /[a-z]/.test(source[i + 1] ?? "")) {
      let end = i + 1;
      while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end++;
      push(i, end, "typevar");
      i = end;
      continue;
    }

    if (c === "@" && /[A-Za-z_]/.test(source[i + 1] ?? "")) {
      push(i, i + 1, "operator");
      let end = i + 1;
      while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end++;
      push(i + 1, end, "alias");
      i = end;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let end = i;
      while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end++;
      const word = source.slice(i, end);
      if (KEYWORDS.has(word)) push(i, end, "keyword");
      else if (aliases.has(word)) push(i, end, "alias");
      else if (/^[A-Z]/.test(word)) push(i, end, "constructor");
      else push(i, end, "variable");
      i = end;
      continue;
    }

    i++;
  }

  return out;
}
