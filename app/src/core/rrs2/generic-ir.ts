// ---------------------------------------------------------------------------
// Generic IR (RRS2, internal)
//
// Intermediate representation produced by the parser before monomorphization.
// Not exported outside core/rrs2/.
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
  | { kind: "term"; ctor: string; children: PatternTerm[] }
  | { kind: "variable"; name: string };

export interface GenericRule {
  left: PatternTerm;
  right: PatternTerm;
}

export interface GenericProgram {
  signature: GenericSignature;
  rules: GenericRule[];
  input: PatternTerm;
}
