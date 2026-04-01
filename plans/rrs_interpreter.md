# RRS Interpreter — TypeScript Web App

## Context

Build a prototype interpreter for the Root Rewrite System defined in `rrs_definition.md`. RRS rewrites terms (trees) by matching patterns at the root and applying the first matching rule. The goal is a visual, interactive tool for stepping through rewrites and seeing terms as trees.

## Tech Stack

- **Vite + TypeScript** — single project, no monorepo complexity
- **Vanilla TS + minimal CSS** — no framework needed for this scope
- **SVG** for tree rendering

## Project Structure

```
/src
  /core
    types.ts        — Signature, Term, TermVar, Rule, Substitution types
    parser.ts       — Parse .rrs text format into core types
    interpreter.ts  — match(), step(), run()
  /ui
    app.ts          — Main app: wire up editor, controls, and tree view
    tree-render.ts  — Recursive SVG tree layout and rendering
    editor.ts       — Text input handling (textarea or contenteditable)
  /styles
    main.css
  main.ts           — Entry point
index.html
```

## Implementation Steps

### 1. Core types (`types.ts`) ✅
- `Signature`: map of type names to `{ arity, childTypes }`
- `Term`: `{ typeName: string, children: Term[] }`
- `TermVar`: `Term | { variable: string }`
- `Rule`: `{ left: TermVar, right: TermVar }`
- `Substitution`: `Map<string, Term>`

> **Implementation notes for next steps:**
> - Project lives in `app/` subfolder (Vite + vanilla-ts template)
> - `TermVar` uses a discriminated union with `kind: "term" | "variable"` — the parser and interpreter must construct/match on this `kind` field
> - Added a `Program` type that bundles `Signature`, `Rule[]`, and `input: Term` — the parser should return this
> - `TypeSet` is `Set<string>` — used in `TypeInfo.childTypes` array

### 2. Parser (`parser.ts`) ✅
- Parse the text format from the definition:
  ```
  signature:
      const Zero
      type Cons:
          Cons | Zero
  
  rules:
      Cons(Zero, x) -> x
  
  input:
      Cons(Zero, Cons(Zero, Zero))
  ```
- Recursive descent parser, no external library needed

> **Implementation notes for next steps:**
> - `parse(source: string): Program` is the public API — tokenizes then parses
> - `ParseError` class has `line` and `col` fields for error reporting in the UI
> - Variable detection: lowercase-start identifiers are variables, uppercase-start are type constructors
> - Validation is done during parsing: arity checks, child type checks, free variable checks on rules
> - Labeled child syntax (`tail: Cons | Zero`) is supported — label is parsed and discarded
> - `#` line comments are supported

### 3. Interpreter (`interpreter.ts`) ✅
- `match(pattern: TermVar, term: Term): Substitution | null` — root-only matching
- `applySubstitution(pattern: TermVar, sub: Substitution): Term`
- `step(rules: Rule[], term: Term): { term: Term, ruleIndex: number } | null` — try rules in order, return new term + which rule matched, or null if normal form
- `run(rules: Rule[], term: Term, maxSteps?: number): Term` — run to normal form

> **Implementation notes for next steps:**
> - `match()` handles repeated variables correctly — if a variable appears twice in a pattern, both occurrences must bind to structurally equal terms
> - `step()` returns a `StepResult` interface (`{ term, ruleIndex }`) — useful for the UI to highlight which rule fired
> - `run()` defaults to 1000 max steps to prevent infinite loops
> - All functions are pure — no side effects, easy to call from UI layer

### 4. SVG tree rendering (`tree-render.ts`) ✅
- Simple top-down recursive layout:
  - Each node is a labeled rectangle/circle with the type name
  - Children are spaced horizontally below
  - Edges connect parent to children
- Highlight the root node when a rewrite just occurred
- Re-render on each step

> **Implementation notes for next steps:**
> - `renderTree(term, container, highlightRoot?)` is the public API — pass an HTMLElement and it replaces its contents with an SVG
> - Two-pass layout: bottom-up sizing (`layoutTree`) then top-down positioning (`positionTree`)
> - `highlightRoot = true` colors the root node yellow/amber to indicate a rewrite just happened
> - Text width is estimated with a monospace heuristic (~0.62 * fontSize per char) — good enough for prototype
> - Constants at top of file control spacing: `H_GAP`, `V_GAP`, `NODE_HEIGHT`, `FONT_SIZE`, `NODE_PADDING_X`

### 5. Web UI (`app.ts`, `index.html`) ✅
- **Left pane**: `<textarea>` for the RRS program (signature + rules + input)
- **Right pane**: SVG container for the tree visualization
- **Controls**: Parse / Step / Run / Reset buttons
- **Status bar**: Show which rule matched, step count, or "Normal form reached"
- **Step-by-step flow**:
  1. User writes RRS program, clicks "Parse"
  2. Input term renders as a tree
  3. Each "Step" click calls `step()`, re-renders tree, highlights matched rule
  4. "Run" executes all steps (with configurable max)

> **Implementation notes:**
> - `initApp()` in `app.ts` wires up all DOM elements and event handlers
> - Replaced the Vite boilerplate in `index.html`, `main.ts`, and `style.css`
> - Layout: fixed-width left editor pane (380px), flexible right tree pane
> - Parse button validates and renders the initial term; Step/Run/Reset are disabled until a successful parse
> - Run uses a loop with `step()` (max 1000 steps) rather than the `run()` function, so it can count steps
> - Status bar shows colored messages: success (green) for normal operation, error (red) for parse errors or step limits
> - A default Nat example program is pre-loaded in the textarea

## Key Design Decisions

- **No framework**: A textarea + SVG + buttons doesn't need React/Vue
- **No external parser library**: The grammar is simple enough for hand-written recursive descent
- **Core is pure functions**: No side effects, easy to test independently of UI
- **Signature validation**: The parser should validate that terms conform to the signature (correct arity, correct child types)

## Verification

- Implement the `Nat` example from the definition: `Zero`, `Cons(Zero)`, `Cons(Cons(Zero))` with rules like `Cons(Zero) -> Zero`
- Implement the `BinTree` example with `rule1` and `rule2` from the definition, verify `rule1` matches and `rule2` doesn't
- Step through and confirm each intermediate term is correct
- Edge cases: no rules match (immediate normal form), infinite loop detection (max steps)

## Reference

- Specification: `rrs_definition.md`
