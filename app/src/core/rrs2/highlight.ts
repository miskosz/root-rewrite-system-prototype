import { KEYWORDS } from "./tokenizer";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function collectAliasNames(source: string): Set<string> {
  const names = new Set<string>();
  const re = /\balias\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) names.add(m[1]);
  return names;
}

export function highlight(source: string): string {
  const aliasNames = collectAliasNames(source);
  const parts: string[] = [];
  let i = 0;

  while (i < source.length) {
    // Line comments
    if (source[i] === "#") {
      let end = i;
      while (end < source.length && source[end] !== "\n") end++;
      parts.push(`<span class="hl-comment">${escapeHtml(source.slice(i, end))}</span>`);
      i = end;
      continue;
    }

    // Newlines — preserve as-is
    if (source[i] === "\n") {
      parts.push("\n");
      i++;
      continue;
    }

    // Whitespace
    if (source[i] === " " || source[i] === "\t" || source[i] === "\r") {
      let end = i;
      while (end < source.length && (source[end] === " " || source[end] === "\t" || source[end] === "\r")) end++;
      parts.push(source.slice(i, end));
      i = end;
      continue;
    }

    // Arrow ->
    if (source[i] === "-" && i + 1 < source.length && source[i + 1] === ">") {
      parts.push(`<span class="hl-operator">-&gt;</span>`);
      i += 2;
      continue;
    }

    // Operators: | : ,
    if (source[i] === "|" || source[i] === ":" || source[i] === ",") {
      parts.push(`<span class="hl-operator">${source[i]}</span>`);
      i++;
      continue;
    }

    // Parentheses
    if (source[i] === "(" || source[i] === ")") {
      parts.push(escapeHtml(source[i]));
      i++;
      continue;
    }

    // Identifiers / keywords
    if (/[A-Za-z_]/.test(source[i])) {
      let end = i;
      while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end++;
      const word = source.slice(i, end);
      if (KEYWORDS.has(word)) {
        parts.push(`<span class="hl-keyword">${word}</span>`);
      } else if (aliasNames.has(word)) {
        parts.push(`<span class="hl-alias">${escapeHtml(word)}</span>`);
      } else if (/^[A-Z]/.test(word)) {
        parts.push(`<span class="hl-constructor">${escapeHtml(word)}</span>`);
      } else {
        parts.push(`<span class="hl-variable">${escapeHtml(word)}</span>`);
      }
      i = end;
      continue;
    }

    // Any other character
    parts.push(escapeHtml(source[i]));
    i++;
  }

  // Textarea always shows a trailing line; pre collapses it. Add a newline so they match.
  const result = parts.join("");
  if (result.endsWith("\n") || result === "") {
    return result + "\n";
  }
  return result;
}
