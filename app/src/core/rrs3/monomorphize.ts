import type { Program, Signature, Term, TermVar, Rule, TypeSet } from "../types";
import { ParseError } from "./tokenizer";
import type {
  GenericProgram,
  GenericSignature,
  GenericRule,
  PatternTerm,
  TypeRef,
} from "./generic-ir";
import { resolveFiniteConstAlias } from "./validator";

// ---------------------------------------------------------------------------
// Monomorphization
//
// Approach: top-down inference. The input root must be a non-generic type;
// from there, every constructor's type arguments are determined by its
// parent's child-type slot. Rules are instantiated per LHS-root instantiation;
// the LHS root's type provides the parameter bindings for the rule.
//
// Type arguments are kept as written in mangled names (e.g. `Cons<Nat>`),
// not expanded over alias members. Aliases are only expanded at slot level
// when computing what concrete constructors a child position accepts.
// ---------------------------------------------------------------------------

/** A TypeRef that contains no `var` subtree (post-substitution). */
type ConcreteRef = TypeRef;

const INSTANTIATION_CAP = 1000;

export function monomorphize(prog: GenericProgram): Program {
  const sig = prog.signature;
  const rulesExpanded = expandForRules(prog.rules, sig);
  const seen = new Set<string>();
  const worklist: ConcreteRef[] = [];
  const outSig: Signature = new Map();
  const outRules: Rule[] = [];

  const schedule = (ref: ConcreteRef): string => {
    if (ref.kind === "var") {
      throw new ParseError(`Internal: cannot schedule a type variable`, 0, 0);
    }
    const decl = sig.get(ref.name);
    if (!decl) throw new ParseError(`Unknown type '${ref.name}'`, 0, 0);
    if (decl.isAlias) {
      throw new ParseError(`Alias '${ref.name}' is not a constructor`, 0, 0);
    }
    const key = mangleRef(ref);
    if (!seen.has(key)) {
      if (seen.size >= INSTANTIATION_CAP) {
        throw new ParseError(
          `Too many type instantiations (cap ${INSTANTIATION_CAP})`,
          0, 0,
        );
      }
      seen.add(key);
      worklist.push(ref);
    }
    return key;
  };

  // -- Walk the input term top-down. Root must be non-generic. --
  if (prog.input.kind === "variable") {
    throw new ParseError(`Input cannot be a variable`, 0, 0);
  }
  const rootName = prog.input.ctor;
  const rootDecl = sig.get(rootName);
  if (!rootDecl) {
    throw new ParseError(`Unknown type '${rootName}' in input`, 0, 0);
  }
  if (rootDecl.params.length > 0) {
    throw new ParseError(
      `Input root constructor '${rootName}' must be non-generic, but it has type parameters`,
      0, 0,
    );
  }
  if (rootDecl.isAlias) {
    throw new ParseError(`Alias '${rootName}' cannot be used as a term constructor`, 0, 0);
  }
  const inputRootRef: ConcreteRef = { kind: "concrete", name: rootName, args: [] };
  const concreteInput = walkTerm(prog.input, inputRootRef, sig, schedule);

  // -- Process worklist: emit type infos and instantiate rules. --
  while (worklist.length > 0) {
    const ref = worklist.shift()!;
    if (ref.kind === "var") continue;
    const decl = sig.get(ref.name)!;
    const key = mangleRef(ref);

    const env = bindParams(decl.params, ref.args, ref.name);

    const childTypes: TypeSet[] = [];
    for (const slot of decl.childTypes) {
      const set: TypeSet = new Set();
      const expanded = expandSlot(slot, env, sig);
      for (const member of expanded) {
        set.add(schedule(member));
      }
      childTypes.push(set);
    }
    outSig.set(key, { arity: childTypes.length, childTypes });

    // Find generic rules whose LHS root constructor matches.
    for (let ri = 0; ri < rulesExpanded.length; ri++) {
      const grule = rulesExpanded[ri];
      if (grule.left.kind !== "term" || grule.left.ctor !== ref.name) continue;
      const concreteRule = instantiateRule(grule, ref, sig, schedule, ri);
      outRules.push(concreteRule);
    }
  }

  return { signature: outSig, rules: outRules, input: concreteInput };
}

// ---------------------------------------------------------------------------
// `for v in Alias` expansion
// ---------------------------------------------------------------------------

/**
 * Expand every rule's `for` bindings into the cartesian product of constant
 * substitutions. Each bound variable is replaced by a zero-arity constructor
 * term for the corresponding constant, restoring linearity.
 */
function expandForRules(rules: GenericRule[], sig: GenericSignature): GenericRule[] {
  const out: GenericRule[] = [];
  for (const rule of rules) {
    if (rule.expansions.length === 0) {
      out.push(rule);
      continue;
    }
    const choices = rule.expansions.map((b) => ({
      varName: b.varName,
      consts: resolveFiniteConstAlias(b.aliasName, sig),
    }));
    const iter = (idx: number, env: Map<string, string>): void => {
      if (idx === choices.length) {
        out.push({
          left: substitutePattern(rule.left, env),
          right: substitutePattern(rule.right, env),
          expansions: [],
        });
        return;
      }
      for (const c of choices[idx].consts) {
        env.set(choices[idx].varName, c);
        iter(idx + 1, env);
      }
      env.delete(choices[idx].varName);
    };
    iter(0, new Map());
  }
  return out;
}

function substitutePattern(pt: PatternTerm, env: Map<string, string>): PatternTerm {
  if (pt.kind === "variable") {
    const c = env.get(pt.name);
    if (c === undefined) return pt;
    return { kind: "term", ctor: c, children: [], line: pt.line, col: pt.col };
  }
  return {
    kind: "term",
    ctor: pt.ctor,
    children: pt.children.map((ch) => substitutePattern(ch, env)),
    line: pt.line,
    col: pt.col,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bindParams(
  params: string[],
  args: ConcreteRef[],
  context: string,
): Map<string, ConcreteRef> {
  if (params.length !== args.length) {
    throw new ParseError(
      `Type '${context}' expects ${params.length} type argument(s), got ${args.length}`,
      0, 0,
    );
  }
  const env = new Map<string, ConcreteRef>();
  for (let i = 0; i < params.length; i++) env.set(params[i], args[i]);
  return env;
}

function substituteRef(ref: TypeRef, env: Map<string, ConcreteRef>): ConcreteRef {
  if (ref.kind === "var") {
    const v = env.get(ref.name);
    if (!v) {
      throw new ParseError(`Unbound type variable '${ref.name}'`, 0, 0);
    }
    return v;
  }
  return {
    kind: "concrete",
    name: ref.name,
    args: ref.args.map(a => substituteRef(a, env)),
  };
}

function mangleRef(ref: ConcreteRef): string {
  if (ref.kind === "var") {
    throw new ParseError(`Internal: cannot mangle a type variable`, 0, 0);
  }
  if (ref.args.length === 0) return ref.name;
  return `${ref.name}<${ref.args.map(mangleRef).join(",")}>`;
}

/**
 * Expand a slot under env into a set of non-alias concrete refs. Aliases are
 * recursively inlined; aliases' own type args are substituted into their body.
 */
function expandSlot(
  slot: TypeRef[],
  env: Map<string, ConcreteRef>,
  sig: GenericSignature,
): ConcreteRef[] {
  const out: ConcreteRef[] = [];
  const seenLocal = new Set<string>();

  const visit = (ref: TypeRef, e: Map<string, ConcreteRef>, stack: Set<string>): void => {
    const sub = substituteRef(ref, e);
    if (sub.kind === "var") {
      throw new ParseError(`Internal: substitution left a type variable`, 0, 0);
    }
    const decl = sig.get(sub.name);
    if (!decl) throw new ParseError(`Unknown type '${sub.name}'`, 0, 0);
    if (!decl.isAlias) {
      const key = mangleRef(sub);
      if (!seenLocal.has(key)) {
        seenLocal.add(key);
        out.push(sub);
      }
      return;
    }
    const key = mangleRef(sub);
    if (stack.has(key)) {
      throw new ParseError(`Alias cycle involving '${sub.name}'`, 0, 0);
    }
    const newStack = new Set(stack);
    newStack.add(key);
    const aliasEnv = bindParams(decl.params, sub.args, sub.name);
    for (const memberRef of decl.childTypes[0]) {
      visit(memberRef, aliasEnv, newStack);
    }
  };

  for (const ref of slot) visit(ref, env, new Set());
  return out;
}

/** Pick the unique constructor with name `ctorName` from a set of refs. */
function pickConstructor(refs: ConcreteRef[], ctorName: string): ConcreteRef | null {
  const matches = refs.filter(r => r.kind === "concrete" && r.name === ctorName);
  if (matches.length === 0) return null;
  const mangles = new Set(matches.map(mangleRef));
  if (mangles.size > 1) {
    throw new ParseError(
      `Ambiguous instantiation of '${ctorName}': could be ${[...mangles].join(" or ")}`,
      0, 0,
    );
  }
  return matches[0];
}

/** Match a constructor against an `expected` ref (which may be an alias). */
function pickConstructorFromRef(
  expected: ConcreteRef,
  ctorName: string,
  sig: GenericSignature,
): ConcreteRef | null {
  const expanded = expandSlot([expected], new Map(), sig);
  return pickConstructor(expanded, ctorName);
}

// ---------------------------------------------------------------------------
// Walking ground input terms
// ---------------------------------------------------------------------------

function walkTerm(
  pt: PatternTerm,
  expected: ConcreteRef,
  sig: GenericSignature,
  schedule: (ref: ConcreteRef) => string,
): Term {
  if (pt.kind === "variable") {
    throw new ParseError(`Input cannot contain variables`, 0, 0);
  }
  const matched = pickConstructorFromRef(expected, pt.ctor, sig);
  if (!matched || matched.kind !== "concrete") {
    throw new ParseError(
      `Constructor '${pt.ctor}' does not match expected type '${mangleRef(expected)}'`,
      0, 0,
    );
  }
  const decl = sig.get(matched.name)!;
  const env = bindParams(decl.params, matched.args, matched.name);
  const key = schedule(matched);
  if (pt.children.length !== decl.childTypes.length) {
    throw new ParseError(
      `Constructor '${pt.ctor}' expects ${decl.childTypes.length} children, got ${pt.children.length}`,
      0, 0,
    );
  }
  const children: Term[] = [];
  for (let i = 0; i < pt.children.length; i++) {
    const slot = decl.childTypes[i];
    const childPt = pt.children[i];
    if (childPt.kind === "variable") {
      throw new ParseError(`Input cannot contain variables`, 0, 0);
    }
    const slotExpanded = expandSlot(slot, env, sig);
    const childExpected = pickConstructor(slotExpanded, childPt.ctor);
    if (!childExpected) {
      throw new ParseError(
        `Constructor '${childPt.ctor}' does not match any member of slot ${i + 1} for '${pt.ctor}'`,
        0, 0,
      );
    }
    children.push(walkTerm(childPt, childExpected, sig, schedule));
  }
  return { typeName: key, children };
}

// ---------------------------------------------------------------------------
// Walking pattern terms (rules)
// ---------------------------------------------------------------------------

function instantiateRule(
  grule: GenericRule,
  instantiation: ConcreteRef,
  sig: GenericSignature,
  schedule: (ref: ConcreteRef) => string,
  index: number,
): Rule {
  const left = walkPattern(grule.left, instantiation, sig, schedule, true, index);

  // Determine the RHS root's expected concrete instantiation. First try to
  // match it against the LHS instantiation (for rules that preserve the root
  // type, possibly via alias expansion). If that fails, the RHS root must be
  // non-generic — otherwise its type arguments are unknown.
  const rhsRoot = grule.right;
  let rhsExpected: ConcreteRef;
  if (rhsRoot.kind === "variable") {
    rhsExpected = instantiation;
  } else {
    const matched = pickConstructorFromRef(instantiation, rhsRoot.ctor, sig);
    if (matched && matched.kind === "concrete") {
      rhsExpected = matched;
    } else {
      const decl = sig.get(rhsRoot.ctor);
      if (!decl) {
        throw new ParseError(
          `Rule ${index + 1}: unknown constructor '${rhsRoot.ctor}'`,
          0, 0,
        );
      }
      if (decl.isAlias) {
        throw new ParseError(
          `Rule ${index + 1}: alias '${rhsRoot.ctor}' cannot be used as a constructor`,
          0, 0,
        );
      }
      if (decl.params.length > 0) {
        throw new ParseError(
          `Rule ${index + 1}: cannot infer type arguments for RHS root constructor '${rhsRoot.ctor}'`,
          0, 0,
        );
      }
      rhsExpected = { kind: "concrete", name: rhsRoot.ctor, args: [] };
    }
  }

  const right = walkPattern(grule.right, rhsExpected, sig, schedule, false, index);
  return { left, right };
}

function walkPattern(
  pt: PatternTerm,
  expected: ConcreteRef,
  sig: GenericSignature,
  schedule: (ref: ConcreteRef) => string,
  isLhs: boolean,
  ruleIndex: number,
): TermVar {
  if (pt.kind === "variable") {
    return { kind: "variable", name: pt.name };
  }
  const matched = pickConstructorFromRef(expected, pt.ctor, sig);
  if (!matched || matched.kind !== "concrete") {
    throw new ParseError(
      `Rule ${ruleIndex + 1}: constructor '${pt.ctor}' does not match expected type '${mangleRef(expected)}'`,
      pt.line, pt.col,
    );
  }
  const decl = sig.get(matched.name)!;
  const env = bindParams(decl.params, matched.args, matched.name);
  const key = schedule(matched);
  if (pt.children.length !== decl.childTypes.length) {
    throw new ParseError(
      `Rule ${ruleIndex + 1}: constructor '${pt.ctor}' expects ${decl.childTypes.length} children, got ${pt.children.length}`,
      pt.line, pt.col,
    );
  }
  const children: TermVar[] = [];
  for (let i = 0; i < pt.children.length; i++) {
    const slot = decl.childTypes[i];
    const childPt = pt.children[i];
    if (childPt.kind === "variable") {
      children.push({ kind: "variable", name: childPt.name });
      continue;
    }
    const slotExpanded = expandSlot(slot, env, sig);
    const childExpected = pickConstructor(slotExpanded, childPt.ctor);
    if (!childExpected) {
      const allowed = slotExpanded.map(mangleRef);
      const slotSubstituted = slot.map((ref) => substituteRef(ref, env));
      const slotDesc = slotSubstituted.map(mangleRef).join(" | ");
      const aliasHint =
        slotSubstituted.length === 1 &&
        slotSubstituted[0].kind === "concrete" &&
        sig.get(slotSubstituted[0].name)?.isAlias
          ? ` (alias '${slotSubstituted[0].name}')`
          : "";
      const allowedList =
        allowed.length === 0
          ? "(none)"
          : allowed.length <= 12
            ? allowed.join(", ")
            : `${allowed.slice(0, 12).join(", ")}, ... (${allowed.length} total)`;
      throw new ParseError(
        `Rule ${ruleIndex + 1}: constructor '${childPt.ctor}' is not allowed at slot ${i + 1} of '${pt.ctor}'. ` +
          `Expected ${slotDesc}${aliasHint}. ` +
          `Allowed constructors: ${allowedList}.`,
        childPt.line, childPt.col,
      );
    }
    children.push(walkPattern(childPt, childExpected, sig, schedule, isLhs, ruleIndex));
  }
  return { kind: "term", typeName: key, children };
}
