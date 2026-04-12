import type { Program } from "../types";
import { tokenize, ParseError, type Token, type TokenKind } from "./tokenizer";
import { validateGeneric, validateMonomorphic } from "./validator";
import { monomorphize } from "./monomorphize";
import type {
  GenericProgram,
  GenericSignature,
  GenericRule,
  PatternTerm,
  TypeRef,
} from "./generic-ir";

// ---------------------------------------------------------------------------
// Parser (RRS2)
//
// Produces a GenericProgram (signature/rules/input may contain type vars).
// Monomorphization erases generics into a concrete Program.
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

  parse(): GenericProgram {
    let signature: GenericSignature | undefined;
    let rules: GenericRule[] | undefined;
    let input: PatternTerm | undefined;

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
        input = this.parsePatternTerm();
      } else {
        this.err(`Unexpected token '${t.value}'`, t.line, t.col);
      }
    }

    if (!signature) this.err("Missing 'signature' section");
    if (!rules) this.err("Missing 'rules' section");
    if (!input) this.err("Missing 'input' section");

    return { signature, rules, input };
  }

  // -- signature ------------------------------------------------------------

  private parseSignature(): GenericSignature {
    const sig: GenericSignature = new Map();
    const aliasNames = new Set<string>();

    const checkDup = (name: string) => {
      if (sig.has(name)) this.err(`Duplicate type '${name}'`);
    };

    while (this.pos < this.tokens.length) {
      const t = this.peek()!;
      if (t.kind === "KW" && (t.value === "rules" || t.value === "input" || t.value === "signature")) break;

      if (t.kind === "KW" && t.value === "const") {
        this.advance();
        const name = this.expect("IDENT").value;
        checkDup(name);
        sig.set(name, { params: [], childTypes: [], isAlias: false, isConst: true });
      } else if (t.kind === "KW" && t.value === "type") {
        this.advance();
        const name = this.expect("IDENT").value;
        checkDup(name);
        const params = this.parseTypeParams();
        this.expect("COLON");
        const childTypes = this.parseChildTypeRefs();
        sig.set(name, { params, childTypes, isAlias: false, isConst: false });
      } else if (t.kind === "KW" && t.value === "alias") {
        this.advance();
        const name = this.expect("IDENT").value;
        checkDup(name);
        const params = this.parseTypeParams();
        this.expect("COLON");
        const row = this.parseTypeRefList();
        sig.set(name, { params, childTypes: [row], isAlias: true, isConst: false });
        aliasNames.add(name);
      } else {
        this.err(`Expected 'const', 'type', or 'alias', got '${t.value}'`, t.line, t.col);
      }
    }

    this.aliasNames = aliasNames;
    return sig;
  }

  /** Parse `< 'a, 'b, ... >` if present, else return []. */
  private parseTypeParams(): string[] {
    if (!this.at("LANGLE")) return [];
    this.advance();
    const params: string[] = [];
    if (!this.at("RANGLE")) {
      params.push(this.expect("TYPEVAR").value);
      while (this.at("COMMA")) {
        this.advance();
        params.push(this.expect("TYPEVAR").value);
      }
    }
    this.expect("RANGLE");
    return params;
  }

  /** Parse one type reference: TYPEVAR | IDENT (`< args >`)? */
  private parseTypeRef(): TypeRef {
    const t = this.peek();
    if (!t) this.err("Expected type reference");
    if (t.kind === "TYPEVAR") {
      this.advance();
      return { kind: "var", name: t.value };
    }
    if (t.kind === "IDENT") {
      this.advance();
      const args: TypeRef[] = [];
      if (this.at("LANGLE")) {
        this.advance();
        if (!this.at("RANGLE")) {
          args.push(this.parseTypeRef());
          while (this.at("COMMA")) {
            this.advance();
            args.push(this.parseTypeRef());
          }
        }
        this.expect("RANGLE");
      }
      return { kind: "concrete", name: t.value, args };
    }
    this.err(`Expected type reference, got '${t.value}'`, t.line, t.col);
  }

  /** Parse `TypeRef ( PIPE TypeRef )*`. */
  private parseTypeRefList(): TypeRef[] {
    const list: TypeRef[] = [this.parseTypeRef()];
    while (this.at("PIPE")) {
      this.advance();
      list.push(this.parseTypeRef());
    }
    return list;
  }

  /** Parse one or more child type lines, each a pipe-separated set. */
  private parseChildTypeRefs(): TypeRef[][] {
    const result: TypeRef[][] = [];

    while (this.pos < this.tokens.length) {
      const t = this.peek()!;
      if (t.kind !== "IDENT" && t.kind !== "TYPEVAR") break;

      // Optional label "name:"
      if (
        t.kind === "IDENT" &&
        this.pos + 1 < this.tokens.length &&
        this.tokens[this.pos + 1].kind === "COLON"
      ) {
        this.advance();
        this.advance();
      }

      result.push(this.parseTypeRefList());
    }

    if (result.length === 0) this.err("Expected at least one child type specification");
    return result;
  }

  // -- rules ----------------------------------------------------------------

  private parseRules(): GenericRule[] {
    const rules: GenericRule[] = [];

    while (this.pos < this.tokens.length) {
      const t = this.peek()!;
      if (t.kind === "KW" && (t.value === "signature" || t.value === "input" || t.value === "rules")) break;

      const left = this.parsePatternTerm();
      this.expect("ARROW");
      const right = this.parsePatternTerm();
      rules.push({ left, right });
    }

    return rules;
  }

  // -- terms ----------------------------------------------------------------

  /** Parse a term that may contain variables. */
  private parsePatternTerm(): PatternTerm {
    const ident = this.expect("IDENT");

    if (isVariable(ident.value)) {
      return { kind: "variable", name: ident.value };
    }

    if (this.aliasNames.has(ident.value)) {
      this.err(`Alias '${ident.value}' cannot be used as a term constructor`, ident.line, ident.col);
    }

    const children: PatternTerm[] = [];
    if (this.at("LPAREN")) {
      this.advance();
      if (!this.at("RPAREN")) {
        children.push(this.parsePatternTerm());
        while (this.at("COMMA")) {
          this.advance();
          children.push(this.parsePatternTerm());
        }
      }
      this.expect("RPAREN");
    }

    return { kind: "term", ctor: ident.value, children };
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
  const genericProgram = new Parser(tokens).parse();
  validateGeneric(genericProgram);
  const program = monomorphize(genericProgram);
  validateMonomorphic(program.signature, program.rules, program.input);
  return program;
}
