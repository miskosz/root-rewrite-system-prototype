// ---------------------------------------------------------------------------
// Tokenizer (RRS2)
// ---------------------------------------------------------------------------

export type TokenKind =
  | "IDENT"    // e.g. Zero, Cons, x
  | "TYPEVAR"  // 't, 'key (apostrophe + lowercase ident)
  | "ARROW"    // ->
  | "PIPE"     // |
  | "COLON"    // :
  | "LPAREN"   // (
  | "RPAREN"   // )
  | "LANGLE"   // <
  | "RANGLE"   // >
  | "COMMA"    // ,
  | "KW";      // signature, rules, input, const, type, alias

export const KEYWORDS = new Set(["signature", "rules", "input", "const", "type", "alias"]);

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  col: number;
}

export class ParseError extends Error {
  line: number;
  col: number;

  constructor(message: string, line: number, col: number) {
    super(`Parse error at ${line}:${col}: ${message}`);
    this.name = "ParseError";
    this.line = line;
    this.col = col;
  }
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  while (i < source.length) {
    // Skip whitespace (but not newlines for tracking)
    if (source[i] === " " || source[i] === "\t") {
      i++;
      col++;
      continue;
    }
    if (source[i] === "\n") {
      i++;
      line++;
      col = 1;
      continue;
    }
    if (source[i] === "\r") {
      i++;
      if (i < source.length && source[i] === "\n") i++;
      line++;
      col = 1;
      continue;
    }

    // Skip line comments (# ...)
    if (source[i] === "#") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    const startCol = col;

    // Arrow ->
    if (source[i] === "-" && i + 1 < source.length && source[i + 1] === ">") {
      tokens.push({ kind: "ARROW", value: "->", line, col: startCol });
      i += 2;
      col += 2;
      continue;
    }

    // Single-char tokens
    const singleChars: Record<string, TokenKind> = {
      "|": "PIPE",
      ":": "COLON",
      "(": "LPAREN",
      ")": "RPAREN",
      "<": "LANGLE",
      ">": "RANGLE",
      ",": "COMMA",
    };
    if (source[i] in singleChars) {
      tokens.push({ kind: singleChars[source[i]], value: source[i], line, col: startCol });
      i++;
      col++;
      continue;
    }

    // Type variables: 't, 'key
    if (source[i] === "'" && i + 1 < source.length && /[a-z]/.test(source[i + 1])) {
      let start = i;
      i++;
      col++;
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) {
        i++;
        col++;
      }
      tokens.push({ kind: "TYPEVAR", value: source.slice(start, i), line, col: startCol });
      continue;
    }

    // Identifiers / keywords
    if (/[A-Za-z_]/.test(source[i])) {
      let start = i;
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) {
        i++;
        col++;
      }
      const value = source.slice(start, i);
      const kind: TokenKind = KEYWORDS.has(value) ? "KW" : "IDENT";
      tokens.push({ kind, value, line, col: startCol });
      continue;
    }

    throw new ParseError(`Unexpected character '${source[i]}'`, line, startCol);
  }

  return tokens;
}
