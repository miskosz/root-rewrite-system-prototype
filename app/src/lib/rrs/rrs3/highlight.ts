import { classify } from "./classify";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlight(source: string): string {
  const tokens = classify(source);
  let out = "";
  let i = 0;
  for (const t of tokens) {
    if (t.start > i) out += escapeHtml(source.slice(i, t.start));
    out += `<span class="hl-${t.cls}">${escapeHtml(source.slice(t.start, t.end))}</span>`;
    i = t.end;
  }
  if (i < source.length) out += escapeHtml(source.slice(i));
  if (!out.endsWith("\n")) out += "\n";
  return out;
}
