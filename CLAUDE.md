# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tutorial site + interpreter for **Root Rewrite Systems (RRS)** — a computation model that rewrites trees by matching patterns at the root and applying the first matching rule. The outdated formal definition lives in `rrs_definition.md`; sample programs live in `programs/`, and WIP formal fondations are in `tex/topics/introduction_to_rss.tex`. The site is built with Astro + MDX and deployed to GitHub Pages at https://miskosz.github.io/root-rewrite-system-prototype/.

Currently RRS3 is the only supported surface language. RRS1/RRS2 have been removed (their sample programs are kept in `programs/` for reference only).

## Commands

All commands run from `app/`:

- `npm run dev` — start Astro dev server (default `http://localhost:4321/root-rewrite-system-prototype/`)
- `npm run build` — produce static site in `app/dist/`
- `npm run preview` — preview the built site

There is no test runner or linter configured.

## Architecture

Astro 6 + MDX + Tailwind 4 (via PostCSS). Tutorial posts are MDX files; static `rrs` code blocks are highlighted at build time, and `<RrsEditor />` components hydrate as live CodeMirror editors with the same syntax highlighting and an animated tree view.

```
app/
├─ astro.config.mjs              # MDX, base path, rehype plugin for `rrs blocks
├─ postcss.config.mjs            # Tailwind 4 via @tailwindcss/postcss
├─ src/
│  ├─ pages/                     # index.astro, playground.astro, posts/[...id].astro
│  ├─ layouts/                   # BaseLayout, PostLayout
│  ├─ content.config.ts          # `posts` collection schema
│  ├─ content/posts/*.mdx        # tutorial posts
│  ├─ components/
│  │  ├─ RrsEditor.astro         # MDX-usable live editor embed
│  │  └─ PostCard.astro
│  ├─ lib/
│  │  ├─ rrs/                    # pure interpreter + parser
│  │  │  ├─ types.ts, interpreter.ts, language.ts
│  │  │  └─ rrs3/                # tokenizer, parser, validator, generic-ir,
│  │  │                          # monomorphize, classify, highlight, index
│  │  ├─ tree/                   # render.ts, animate.ts (SVG, DOM-coupled)
│  │  ├─ editor/cm-rrs.ts        # CodeMirror 6 RRS3 highlight extension
│  │  ├─ session.ts              # RrsSession state machine (no DOM)
│  │  ├─ embed/mount.ts          # mounts CM6 + controls + tree into a `.rrs-embed`
│  │  └─ rehype-rrs.ts           # rehype plugin: highlights ```rrs fenced blocks
│  └─ styles/global.css          # Tailwind entry + .hl-* token colours + embed CSS
└─ .github/workflows/deploy.yml  # GH Pages CI
```

### Key modules

- **`lib/rrs/types.ts`** — `Signature`, `Term`, `TermVar`, `Rule`, `Substitution`, `Program`. Mirror `rrs_definition.md`.
- **`lib/rrs/interpreter.ts`** — pure `match` / `step` / `applySubstitution` / `run`.
- **`lib/rrs/rrs3/`** — RRS3 surface syntax: parser produces a `generic-ir`, `monomorphize.ts` lowers it to the core `Program`. `classify.ts` is the single source of truth for token classification, used by both `highlight.ts` (HTML output) and `editor/cm-rrs.ts` (CodeMirror decorations).
- **`lib/session.ts`** — `RrsSession` owns parse/match/step/undo/run state and emits events (`change`, `status`, `matchPreview`, `step`). No DOM access.
- **`lib/embed/mount.ts`** — only place DOM is touched for the live editor: builds CM6, buttons, status, and drives tree render/animate from session events.

### Authoring posts

Drop a `.mdx` file in `src/content/posts/` with frontmatter (`title`, `date`, `summary`, optional `draft`). Inline:

- ` ```rrs ` fenced blocks → static, highlighted at build time by `rehype-rrs.ts`.
- `<RrsEditor code={...} height="220px" />` → live, hydrated editor + tree.

### Adding a future language variant (e.g. RRS4)

1. Add `lib/rrs/<lang>/` with tokenizer/parser/validator/classify/highlight producing a core `Program`. Reuse the `Language` interface in `lib/rrs/language.ts`.
2. If the surface syntax has generics/aliases, follow the rrs3 pattern: parse to an IR, lower via `monomorphize.ts`.
3. Wire the new language into `session.ts` (and likely add a language prop to `RrsEditor`).

## Working with plan files

When implementing a part of a markdown plan file under `plans/`, always:

- Mark the implemented part as done in the plan file.
- Write down important learnings for implementation of the next steps in the same file.
