/**
 * Core types for the Root Rewrite System (RRS) interpreter.
 *
 * Follows the definitions in rrs_definition.md.
 */

/** A set of types that a child position accepts. */
export type TypeSet = Set<string>;

/** Information about a single type in the signature. */
export interface TypeInfo {
  arity: number;
  /** childTypes[i] is the set of type names accepted at position i. */
  childTypes: TypeSet[];
}

/** Signature = (Types, arity, childTypes) — maps type names to their arity and child type constraints. */
export type Signature = Map<string, TypeInfo>;

/** A ground term: a type name applied to children (which are themselves terms). */
export interface Term {
  typeName: string;
  children: Term[];
}

/** A term that may contain variables in place of sub-terms. */
export type TermVar =
  | { kind: "term"; typeName: string; children: TermVar[] }
  | { kind: "variable"; name: string };

/** A rewrite rule: left-hand side pattern -> right-hand side pattern. */
export interface Rule {
  left: TermVar;
  right: TermVar;
}

/** A substitution maps variable names to ground terms. */
export type Substitution = Map<string, Term>;

/** A complete RRS program: signature, rules, and an input term. */
export interface Program {
  signature: Signature;
  rules: Rule[];
  input: Term;
}
