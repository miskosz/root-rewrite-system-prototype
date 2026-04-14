# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Prototype interpreter and visualizer for **Root Rewrite Systems (RRS)** — a computation model that rewrites typed trees by matching patterns at the root and applying the first matching rule. The formal definition lives in `rrs_definition.md`; sample programs live in `programs/` (`.rrs` for RRS1, `.rrs2` for RRS2).

## Commands

All commands run from `app/`:

- `npm run dev` — start Vite dev server
- `npm run build` — typecheck (`tsc`) and build for production
- `npm run preview` — preview production build

There is no test runner or linter configured.

## Architecture

Single Vite + TypeScript app; no framework. Entry is `app/src/main.ts` → `ui/app.ts`.

### Core (`app/src/core/`)

- `types.ts` — `Signature`, `Term`, `TermVar`, `Rule`, `Substitution`, `Program`. These follow `rrs_definition.md` literally; keep them aligned.
- `interpreter.ts` — language-agnostic `match` / `step` / rewrite logic operating on the core `Program` types.
- `language.ts` + `languages.ts` — pluggable `Language` interface (`id`, `parse`, `highlight`, `defaultProgram`). Registered languages are added to the `LANGUAGES` array.
- `rrs1/` — first language variant: tokenizer, parser, validator, highlighter, all exposed via `rrs1/index.ts` as a `Language`.
- `rrs2/` — second variant. Adds **generics** and **sum type aliases**: parsing produces a `generic-ir.ts` representation which is lowered to the core monomorphic `Program` by `monomorphize.ts` before reaching the interpreter.

All languages compile down to the same core `Program`, so the interpreter and UI are shared.

### UI (`app/src/ui/`)

- `app.ts` — wires editor, language selector, controls, and tree view.
- `tree-render.ts` — recursive SVG tree layout.
- `tree-animate.ts` — animated transitions between rewrite steps.

### Adding a language variant

1. Create `core/<lang>/` with tokenizer/parser/validator/highlight producing a core `Program`.
2. Export a `Language` object from `core/<lang>/index.ts`.
3. Register in `core/languages.ts`.

If the surface syntax is richer than the core model (generics, aliases, etc.), follow the rrs2 pattern: parse to a language-specific IR, then lower to the monomorphic core `Program`.

## Working with plan files

When implementing a part of a markdown plan file under `plans/`, always:

- Mark the implemented part as done in the plan file.
- Write down important learnings for implementation of the next steps in the same file.
