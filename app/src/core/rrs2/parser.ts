import type { Signature, TypeSet, Term, TermVar, Rule, Program } from "../types";
import { tokenize, ParseError, type Token, type TokenKind } from "./tokenizer";
import { validate } from "./validator";

// ---------------------------------------------------------------------------
// Parser (RRS2)
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0;
  private tokens: Token[];
  private aliasNames: Set<string> = new Set();

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
    // Pass 1: collect raw declarations
    const consts = new Set<string>();
    const typeDecls = new Map<string, { childTypesRaw: string[][] }>();
    const aliasDecls = new Map<string, string[]>();

    const checkDup = (name: string) => {
      if (consts.has(name) || typeDecls.has(name) || aliasDecls.has(name)) {
        this.err(`Duplicate type '${name}'`);
      }
    };

    while (this.pos < this.tokens.length) {
      const t = this.peek()!;
      if (t.kind === "KW" && (t.value === "rules" || t.value === "input" || t.value === "signature")) break;

      if (t.kind === "KW" && t.value === "const") {
        this.advance();
        const name = this.expect("IDENT").value;
        checkDup(name);
        consts.add(name);
      } else if (t.kind === "KW" && t.value === "type") {
        this.advance();
        const name = this.expect("IDENT").value;
        checkDup(name);
        this.expect("COLON");
        const childTypesRaw = this.parseChildTypesRaw();
        typeDecls.set(name, { childTypesRaw });
      } else if (t.kind === "KW" && t.value === "alias") {
        this.advance();
        const name = this.expect("IDENT").value;
        checkDup(name);
        this.expect("COLON");
        aliasDecls.set(name, this.parseTypeListRaw());
      } else {
        this.err(`Expected 'const', 'type', or 'alias', got '${t.value}'`, t.line, t.col);
      }
    }

    this.aliasNames = new Set(aliasDecls.keys());

    // Pass 2: resolve aliases
    const resolvedAliases = new Map<string, Set<string>>();
    const resolveAlias = (name: string, stack: Set<string>): Set<string> => {
      const cached = resolvedAliases.get(name);
      if (cached) return cached;
      if (stack.has(name)) throw new ParseError(`Alias cycle involving '${name}'`, 0, 0);
      stack.add(name);
      const members = aliasDecls.get(name)!;
      const out = new Set<string>();
      for (const m of members) {
        if (consts.has(m) || typeDecls.has(m)) {
          out.add(m);
        } else if (aliasDecls.has(m)) {
          for (const x of resolveAlias(m, stack)) out.add(x);
        } else {
          throw new ParseError(`Alias '${name}' references unknown name '${m}'`, 0, 0);
        }
      }
      stack.delete(name);
      resolvedAliases.set(name, out);
      return out;
    };

    for (const name of aliasDecls.keys()) resolveAlias(name, new Set());

    // Build final signature
    const sig: Signature = new Map();
    for (const name of consts) {
      sig.set(name, { arity: 0, childTypes: [] });
    }
    for (const [name, decl] of typeDecls) {
      const childTypes: TypeSet[] = [];
      for (const slot of decl.childTypesRaw) {
        const set: TypeSet = new Set();
        for (const m of slot) {
          if (consts.has(m) || typeDecls.has(m)) {
            set.add(m);
          } else if (aliasDecls.has(m)) {
            for (const x of resolvedAliases.get(m)!) set.add(x);
          } else {
            throw new ParseError(`Type '${name}' references unknown name '${m}'`, 0, 0);
          }
        }
        childTypes.push(set);
      }
      sig.set(name, { arity: childTypes.length, childTypes });
    }

    return sig;
  }

  /** Parse one or more child type lines as raw string lists. */
  private parseChildTypesRaw(): string[][] {
    const result: string[][] = [];

    while (this.pos < this.tokens.length) {
      const t = this.peek()!;
      if (t.kind !== "IDENT") break;

      if (this.pos + 1 < this.tokens.length && this.tokens[this.pos + 1].kind === "COLON") {
        this.advance();
        this.advance();
      }

      result.push(this.parseTypeListRaw());
    }

    if (result.length === 0) this.err("Expected at least one child type specification");
    return result;
  }

  /** Parse `Name | Name | ...` as a raw list. */
  private parseTypeListRaw(): string[] {
    const list: string[] = [];
    list.push(this.expect("IDENT").value);
    while (this.at("PIPE")) {
      this.advance();
      list.push(this.expect("IDENT").value);
    }
    return list;
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
    const tok = this.expect("IDENT");
    const name = tok.value;
    if (this.aliasNames.has(name)) {
      this.err(`Alias '${name}' cannot be used as a term constructor`, tok.line, tok.col);
    }
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

    if (this.aliasNames.has(ident.value)) {
      this.err(`Alias '${ident.value}' cannot be used as a term constructor`, ident.line, ident.col);
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
