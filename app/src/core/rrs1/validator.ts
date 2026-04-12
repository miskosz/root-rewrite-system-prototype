import type { Signature, Term, TermVar, Rule } from "../types";
import { ParseError } from "./tokenizer";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validate(sig: Signature, rules: Rule[], input: Term): void {
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
  const leftVarCounts = new Map<string, number>();
  const rightVarCounts = new Map<string, number>();

  countVars(rule.left, leftVarCounts);
  countVars(rule.right, rightVarCounts);

  // Check linearity: each variable appears at most once on each side
  for (const [v, count] of leftVarCounts) {
    if (count > 1) {
      throw new ParseError(
        `Rule ${index + 1}: variable '${v}' appears ${count} times on left side (must be linear)`,
        0, 0,
      );
    }
  }
  for (const [v, count] of rightVarCounts) {
    if (count > 1) {
      throw new ParseError(
        `Rule ${index + 1}: variable '${v}' appears ${count} times on right side (must be linear)`,
        0, 0,
      );
    }
  }

  const leftVars = new Set(leftVarCounts.keys());
  const rightVars = new Set(rightVarCounts.keys());

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

function countVars(tv: TermVar, counts: Map<string, number>): void {
  if (tv.kind === "variable") {
    counts.set(tv.name, (counts.get(tv.name) ?? 0) + 1);
  } else {
    for (const child of tv.children) {
      countVars(child, counts);
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
