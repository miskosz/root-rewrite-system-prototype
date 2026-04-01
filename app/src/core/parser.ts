import type { Signature, TypeSet, Term, TermVar, Rule, Program } from "./types";

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenKind =
  | "IDENT"    // e.g. Zero, Cons, x
  | "ARROW"    // ->
  | "PIPE"     // |
  | "COLON"    // :
  | "LPAREN"   // (
  | "RPAREN"   // )
  | "COMMA"    // ,
  | "KW";      // signature, rules, input, const, type

const KEYWORDS = new Set(["signature", "rules", "input", "const", "type"]);

interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  col: number;
}

function tokenize(source: string): Token[] {
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
      ",": "COMMA",
    };
    if (source[i] in singleChars) {
      tokens.push({ kind: singleChars[source[i]], value: source[i], line, col: startCol });
      i++;
      col++;
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

// ---------------------------------------------------------------------------
// Parse error
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0;
  private tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // -- helpers --------------------------------------------------------------

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (!t) this.err("Unexpected end of input");
    this.pos++;
    return t;
  }

  private expect(kind: TokenKind, value?: string): Token {
    const t = this.advance();
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      this.err(
        `Expected ${value ? `'${value}'` : kind}, got '${t.value}'`,
        t.line,
        t.col,
      );
    }
    return t;
  }

  private at(kind: TokenKind, value?: string): boolean {
    const t = this.peek();
    if (!t) return false;
    return t.kind === kind && (value === undefined || t.value === value);
  }

  private err(msg: string, line?: number, col?: number): never {
    const t = this.peek();
    throw new ParseError(msg, line ?? t?.line ?? 0, col ?? t?.col ?? 0);
  }

  // -- grammar --------------------------------------------------------------

  /** Top-level: signature, rules, input sections in any order. */
  parse(): Program {
    let signature: Signature | undefined;
    let rules: Rule[] | undefined;
    let input: Term | undefined;

    while (this.pos < this.tokens.length) {
      const t = this.peek()!;
      if (t.kind === "KW" && t.value === "signature") {
        if (signature) this.err("Duplicate 'signature' section", t.line, t.col);
        this.advance();
        this.expect("COLON");
        signature = this.parseSignature();
      } else if (t.kind === "KW" && t.value === "rules") {
        this.advance();
        this.expect("COLON");
        rules = this.parseRules();
      } else if (t.kind === "KW" && t.value === "input") {
        if (input) this.err("Duplicate 'input' section", t.line, t.col);
        this.advance();
        this.expect("COLON");
        input = this.parseTerm();
      } else {
        this.err(`Unexpected token '${t.value}'`, t.line, t.col);
      }
    }

    if (!signature) this.err("Missing 'signature' section");
    if (!rules) this.err("Missing 'rules' section");
    if (!input) this.err("Missing 'input' section");

    validate(signature, rules, input);

    return { signature, rules, input };
  }

  // -- signature ------------------------------------------------------------

  private parseSignature(): Signature {
    const sig: Signature = new Map();

    while (this.pos < this.tokens.length) {
      const t = this.peek()!;
      // Section boundary: another top-level keyword
      if (t.kind === "KW" && (t.value === "rules" || t.value === "input" || t.value === "signature")) break;

      if (t.kind === "KW" && t.value === "const") {
        this.advance();
        const name = this.expect("IDENT").value;
        if (sig.has(name)) this.err(`Duplicate type '${name}'`);
        sig.set(name, { arity: 0, childTypes: [] });
      } else if (t.kind === "KW" && t.value === "type") {
        this.advance();
        const name = this.expect("IDENT").value;
        if (sig.has(name)) this.err(`Duplicate type '${name}'`);
        this.expect("COLON");
        const childTypes = this.parseChildTypes();
        sig.set(name, { arity: childTypes.length, childTypes });
      } else {
        this.err(`Expected 'const' or 'type', got '${t.value}'`, t.line, t.col);
      }
    }

    return sig;
  }

  /** Parse one or more child type lines, each being `Name | Name | ...` optionally prefixed with `label:`. */
  private parseChildTypes(): TypeSet[] {
    const result: TypeSet[] = [];

    while (this.pos < this.tokens.length) {
      const t = this.peek()!;
      // Not an IDENT → end of child types
      if (t.kind !== "IDENT") break;

      // Lookahead: if IDENT COLON, it's a labeled child → skip label
      if (this.pos + 1 < this.tokens.length && this.tokens[this.pos + 1].kind === "COLON") {
        this.advance(); // skip label
        this.advance(); // skip colon
      }

      result.push(this.parseTypeSet());
    }

    if (result.length === 0) this.err("Expected at least one child type specification");
    return result;
  }

  /** Parse `Name | Name | ...` */
  private parseTypeSet(): TypeSet {
    const set: TypeSet = new Set();
    set.add(this.expect("IDENT").value);
    while (this.at("PIPE")) {
      this.advance();
      set.add(this.expect("IDENT").value);
    }
    return set;
  }

  // -- rules ----------------------------------------------------------------

  private parseRules(): Rule[] {
    const rules: Rule[] = [];

    while (this.pos < this.tokens.length) {
      const t = this.peek()!;
      if (t.kind === "KW" && (t.value === "signature" || t.value === "input" || t.value === "rules")) break;

      const left = this.parseTermVar();
      this.expect("ARROW");
      const right = this.parseTermVar();
      rules.push({ left, right });
    }

    return rules;
  }

  // -- terms ----------------------------------------------------------------

  /** Parse a ground term (no variables allowed). */
  private parseTerm(): Term {
    const name = this.expect("IDENT").value;
    const children: Term[] = [];

    if (this.at("LPAREN")) {
      this.advance();
      if (!this.at("RPAREN")) {
        children.push(this.parseTerm());
        while (this.at("COMMA")) {
          this.advance();
          children.push(this.parseTerm());
        }
      }
      this.expect("RPAREN");
    }

    return { typeName: name, children };
  }

  /** Parse a term that may contain variables. Convention: uppercase start = type, lowercase = variable. */
  private parseTermVar(): TermVar {
    const ident = this.expect("IDENT");

    if (isVariable(ident.value)) {
      return { kind: "variable", name: ident.value };
    }

    const children: TermVar[] = [];
    if (this.at("LPAREN")) {
      this.advance();
      if (!this.at("RPAREN")) {
        children.push(this.parseTermVar());
        while (this.at("COMMA")) {
          this.advance();
          children.push(this.parseTermVar());
        }
      }
      this.expect("RPAREN");
    }

    return { kind: "term", typeName: ident.value, children };
  }
}

/** Variables start with a lowercase letter. */
function isVariable(name: string): boolean {
  return /^[a-z]/.test(name);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(sig: Signature, rules: Rule[], input: Term): void {
  // Validate input term against signature
  validateTerm(sig, input);

  // Validate each rule
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    validateRule(sig, rule, i);
  }
}

function validateTerm(sig: Signature, term: Term): void {
  const info = sig.get(term.typeName);
  if (!info) {
    throw new ParseError(`Unknown type '${term.typeName}'`, 0, 0);
  }
  if (term.children.length !== info.arity) {
    throw new ParseError(
      `Type '${term.typeName}' expects ${info.arity} children, got ${term.children.length}`,
      0, 0,
    );
  }
  for (let i = 0; i < term.children.length; i++) {
    const child = term.children[i];
    if (!info.childTypes[i].has(child.typeName)) {
      throw new ParseError(
        `Type '${term.typeName}' child ${i + 1}: expected one of {${[...info.childTypes[i]].join(", ")}}, got '${child.typeName}'`,
        0, 0,
      );
    }
    validateTerm(sig, child);
  }
}

function validateRule(sig: Signature, rule: Rule, index: number): void {
  const leftVars = new Set<string>();
  const rightVars = new Set<string>();

  collectVars(rule.left, leftVars);
  collectVars(rule.right, rightVars);

  // Check: every variable in right must occur in left
  for (const v of rightVars) {
    if (!leftVars.has(v)) {
      throw new ParseError(
        `Rule ${index + 1}: variable '${v}' appears in right side but not in left side`,
        0, 0,
      );
    }
  }

  // Validate that the left side root is a known type (not a bare variable)
  if (rule.left.kind === "variable") {
    throw new ParseError(`Rule ${index + 1}: left side cannot be a bare variable`, 0, 0);
  }

  // Validate term structure against signature (where possible — variables are wildcards)
  validateTermVar(sig, rule.left, `Rule ${index + 1} left`);
  validateTermVar(sig, rule.right, `Rule ${index + 1} right`);
}

function collectVars(tv: TermVar, vars: Set<string>): void {
  if (tv.kind === "variable") {
    vars.add(tv.name);
  } else {
    for (const child of tv.children) {
      collectVars(child, vars);
    }
  }
}

function validateTermVar(sig: Signature, tv: TermVar, context: string): void {
  if (tv.kind === "variable") return;

  const info = sig.get(tv.typeName);
  if (!info) {
    throw new ParseError(`${context}: unknown type '${tv.typeName}'`, 0, 0);
  }
  if (tv.children.length !== info.arity) {
    throw new ParseError(
      `${context}: type '${tv.typeName}' expects ${info.arity} children, got ${tv.children.length}`,
      0, 0,
    );
  }
  for (const child of tv.children) {
    validateTermVar(sig, child, context);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parse(source: string): Program {
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  return parser.parse();
}
