import type { Signature, TypeSet, Term, TermVar, Rule, Program } from "../types";
import { tokenize, ParseError, type Token, type TokenKind } from "./tokenizer";
import { validate } from "./validator";

// ---------------------------------------------------------------------------
// Parser (RRS1)
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
// Public API
// ---------------------------------------------------------------------------

export function parseProgram(source: string): Program {
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  return parser.parse();
}
