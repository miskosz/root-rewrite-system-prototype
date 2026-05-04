import type { Term, TermVar, Rule, Substitution } from "./types";

/**
 * Match a pattern (TermVar) against a ground term at the root.
 * Returns a substitution if successful, or null if the pattern doesn't match.
 */
export function match(pattern: TermVar, term: Term): Substitution | null {
  const sub: Substitution = new Map();
  if (matchInner(pattern, term, sub)) return sub;
  return null;
}

function matchInner(pattern: TermVar, term: Term, sub: Substitution): boolean {
  if (pattern.kind === "variable") {
    const existing = sub.get(pattern.name);
    if (existing) {
      // Variable already bound — must match the same term
      return termsEqual(existing, term);
    }
    sub.set(pattern.name, term);
    return true;
  }

  // pattern is a term node — type name and arity must match
  if (pattern.typeName !== term.typeName) return false;
  if (pattern.children.length !== term.children.length) return false;

  for (let i = 0; i < pattern.children.length; i++) {
    if (!matchInner(pattern.children[i], term.children[i], sub)) return false;
  }
  return true;
}

function termsEqual(a: Term, b: Term): boolean {
  if (a.typeName !== b.typeName) return false;
  if (a.children.length !== b.children.length) return false;
  for (let i = 0; i < a.children.length; i++) {
    if (!termsEqual(a.children[i], b.children[i])) return false;
  }
  return true;
}

/**
 * Apply a substitution to a pattern, producing a ground term.
 * All variables in the pattern must be present in the substitution.
 */
export function applySubstitution(pattern: TermVar, sub: Substitution): Term {
  if (pattern.kind === "variable") {
    const term = sub.get(pattern.name);
    if (!term) throw new Error(`Variable '${pattern.name}' not found in substitution`);
    return term;
  }

  return {
    typeName: pattern.typeName,
    children: pattern.children.map((child) => applySubstitution(child, sub)),
  };
}

export interface StepResult {
  term: Term;
  ruleIndex: number;
  rule: Rule;
  substitution: Substitution;
}

/**
 * Try rules in order against the term's root. Returns the rewritten term
 * and the index of the matched rule, or null if no rule matches (normal form).
 */
export function step(rules: Rule[], term: Term): StepResult | null {
  for (let i = 0; i < rules.length; i++) {
    const sub = match(rules[i].left, term);
    if (sub) {
      return {
        term: applySubstitution(rules[i].right, sub),
        ruleIndex: i,
        rule: rules[i],
        substitution: sub,
      };
    }
  }
  return null;
}

/**
 * Run the term to normal form (no rule matches), up to maxSteps.
 * Default maxSteps is 1000 to prevent infinite loops.
 */
export function run(rules: Rule[], term: Term, maxSteps = 1000): Term {
  let current = term;
  for (let i = 0; i < maxSteps; i++) {
    const result = step(rules, current);
    if (!result) return current;
    current = result.term;
  }
  return current;
}
