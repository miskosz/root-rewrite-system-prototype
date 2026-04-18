import type { Signature, Term, TermVar, Rule } from "../types";
import { ParseError } from "./tokenizer";
import type {
  GenericProgram,
  GenericSignature,
  GenericRule,
  PatternTerm,
  TypeRef,
} from "./generic-ir";

// ---------------------------------------------------------------------------
// Generic-level validation (runs before monomorphization)
// ---------------------------------------------------------------------------

export function validateGeneric(prog: GenericProgram): void {
  const sig = prog.signature;

  // For each declaration, check that body type-vars are declared and that
  // every concrete type reference exists with the right arity.
  for (const [name, decl] of sig) {
    const declared = new Set(decl.params);
    for (const slot of decl.childTypes) {
      for (const ref of slot) {
        validateTypeRef(ref, declared, sig, `type/alias '${name}'`);
      }
    }
  }

  // Rule structural checks (linearity, RHS-vars-subset-of-LHS-vars,
  // LHS root not bare variable).
  for (let i = 0; i < prog.rules.length; i++) {
    validateGenericRule(prog.rules[i], i, sig);
    validatePatternCtors(prog.rules[i].left, sig, `Rule ${i + 1} left`);
    validatePatternCtors(prog.rules[i].right, sig, `Rule ${i + 1} right`);
  }

  validatePatternCtors(prog.input, sig, "input");
}

function validatePatternCtors(
  pt: PatternTerm,
  sig: GenericSignature,
  context: string,
): void {
  if (pt.kind === "variable") return;
  const decl = sig.get(pt.ctor);
  if (!decl) {
    throw new ParseError(
      `${context}: unknown constructor '${pt.ctor}'`,
      pt.line, pt.col,
    );
  }
  if (decl.isAlias) {
    throw new ParseError(
      `${context}: alias '${pt.ctor}' cannot be used as a constructor`,
      pt.line, pt.col,
    );
  }
  for (const c of pt.children) validatePatternCtors(c, sig, context);
}

function validateTypeRef(
  ref: TypeRef,
  declaredVars: Set<string>,
  sig: GenericSignature,
  context: string,
): void {
  if (ref.kind === "var") {
    if (!declaredVars.has(ref.name)) {
      throw new ParseError(
        `${context}: undeclared type variable '${ref.name}'`,
        0, 0,
      );
    }
    return;
  }
  const decl = sig.get(ref.name);
  if (!decl) {
    throw new ParseError(`${context}: unknown type '${ref.name}'`, 0, 0);
  }
  if (ref.args.length !== decl.params.length) {
    throw new ParseError(
      `${context}: type '${ref.name}' expects ${decl.params.length} type argument(s), got ${ref.args.length}`,
      0, 0,
    );
  }
  for (const arg of ref.args) {
    validateTypeRef(arg, declaredVars, sig, context);
  }
}

function validateGenericRule(rule: GenericRule, index: number, sig: GenericSignature): void {
  // Validate `for` expansions: alias must exist, be an alias, and its body
  // must be a finite, non-empty set of zero-arity, non-generic constants.
  const expandedVars = new Set<string>();
  for (const b of rule.expansions) {
    if (expandedVars.has(b.varName)) {
      throw new ParseError(
        `Rule ${index + 1}: 'for' binder '${b.varName}' is bound twice`,
        b.line, b.col,
      );
    }
    expandedVars.add(b.varName);
    const consts = resolveFiniteConstAlias(b.aliasName, sig);
    if (consts.length === 0) {
      throw new ParseError(
        `Rule ${index + 1}: 'for ${b.varName} in ${b.aliasName}' — '${b.aliasName}' is not a finite const alias`,
        b.line, b.col,
      );
    }
  }

  const leftCounts = new Map<string, number>();
  const rightCounts = new Map<string, number>();
  countPatternVars(rule.left, leftCounts);
  countPatternVars(rule.right, rightCounts);

  for (const [v, c] of leftCounts) {
    if (expandedVars.has(v)) continue;
    if (c > 1) {
      throw new ParseError(
        `Rule ${index + 1}: variable '${v}' appears ${c} times on left side (must be linear)`,
        0, 0,
      );
    }
  }
  for (const [v, c] of rightCounts) {
    if (expandedVars.has(v)) continue;
    if (c > 1) {
      throw new ParseError(
        `Rule ${index + 1}: variable '${v}' appears ${c} times on right side (must be linear)`,
        0, 0,
      );
    }
  }

  const leftVars = new Set(leftCounts.keys());
  for (const v of rightCounts.keys()) {
    if (!leftVars.has(v)) {
      throw new ParseError(
        `Rule ${index + 1}: variable '${v}' appears in right side but not in left side`,
        0, 0,
      );
    }
  }

  // Every `for` binder must actually appear on the LHS.
  for (const b of rule.expansions) {
    if (!leftCounts.has(b.varName)) {
      throw new ParseError(
        `Rule ${index + 1}: 'for' binder '${b.varName}' does not appear on left side`,
        b.line, b.col,
      );
    }
  }

  if (rule.left.kind === "variable") {
    throw new ParseError(`Rule ${index + 1}: left side cannot be a bare variable`, 0, 0);
  }
}

/**
 * Resolve an alias name to the ordered list of its constant members, if the
 * alias body consists only of zero-arity, non-generic, non-alias constants.
 * Returns [] if the alias does not exist or is not a finite const alias.
 */
export function resolveFiniteConstAlias(
  aliasName: string,
  sig: GenericSignature,
): string[] {
  const decl = sig.get(aliasName);
  if (!decl || !decl.isAlias) return [];
  if (decl.params.length > 0) return [];
  const members: string[] = [];
  for (const ref of decl.childTypes[0]) {
    if (ref.kind !== "concrete" || ref.args.length > 0) return [];
    const memberDecl = sig.get(ref.name);
    if (!memberDecl) return [];
    if (!memberDecl.isConst) return [];
    members.push(ref.name);
  }
  return members;
}

function countPatternVars(pt: PatternTerm, counts: Map<string, number>): void {
  if (pt.kind === "variable") {
    counts.set(pt.name, (counts.get(pt.name) ?? 0) + 1);
  } else {
    for (const c of pt.children) countPatternVars(c, counts);
  }
}

// ---------------------------------------------------------------------------
// Monomorphic validation (sanity pass after monomorphization)
// ---------------------------------------------------------------------------

export function validateMonomorphic(sig: Signature, rules: Rule[], input: Term): void {
  validateTerm(sig, input);
  for (let i = 0; i < rules.length; i++) {
    validateRule(sig, rules[i], i);
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
  validateTermVar(sig, rule.left, `Rule ${index + 1} left`);
  validateTermVar(sig, rule.right, `Rule ${index + 1} right`);
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
