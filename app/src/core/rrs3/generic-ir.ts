// ---------------------------------------------------------------------------
// Generic IR (internal)
//
// Intermediate representation produced by the parser before monomorphization.
// Internal to this language module.
// ---------------------------------------------------------------------------

/** A reference to a type, possibly generic. */
export type TypeRef =
  | { kind: "concrete"; name: string; args: TypeRef[] }
  | { kind: "var"; name: string };

export interface GenericTypeDecl {
  /** Apostrophe-prefixed parameter names, e.g. ["'key", "'value"]. */
  params: string[];
  /** Each row is a pipe-separated set of accepted type refs. */
  childTypes: TypeRef[][];
  /** True for `alias`, false for `type` / `const`. */
  isAlias: boolean;
  /** True for `const` (zero children, zero params). */
  isConst: boolean;
}

export type GenericSignature = Map<string, GenericTypeDecl>;

/** A pattern term that may contain term variables. No explicit type args. */
export type PatternTerm =
  | { kind: "term"; ctor: string; children: PatternTerm[]; line: number; col: number }
  | { kind: "variable"; name: string; line: number; col: number };

/** A `for var in Alias` binding: expands the rule over each constant member. */
export interface ForBinding {
  varName: string;
  aliasName: string;
  line: number;
  col: number;
}

export interface GenericRule {
  left: PatternTerm;
  right: PatternTerm;
  /** Optional `for` bindings that expand this rule over finite-const aliases. */
  expansions: ForBinding[];
}

export interface GenericProgram {
  signature: GenericSignature;
  rules: GenericRule[];
  input: PatternTerm;
}
