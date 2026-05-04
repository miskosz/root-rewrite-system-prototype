# RRS Tutorial Site

## Context

The repo currently ships a single Vite + TypeScript playground that supports RRS1/RRS2/RRS3. We want to build a tutorial website on top of the same core: multiple long-form posts authored in Markdown, with **live, embedded RRS editors** inline in the prose. The site needs to look nice, be easy to read, and deploy to GitHub Pages.

The core interpreter, parser, and tree renderer/animator are worth keeping; the playground UI shell is throwaway. RRS1 and RRS2 are dropped (RRS3 only; RRS4 may slot in later).

## Decisions (confirmed)

- **Framework:** Astro + MDX. Posts are `.mdx`; interactive editors are component islands hydrated on demand.
- **Editor:** CodeMirror 6 with a custom RRS3 stream parser ported from the existing tokenizer + highlighter.
- **Repo shape:** Single Astro app inside `app/`. Pure logic moves to `src/lib/`; UI rebuilt from scratch.
- **Embed API:** MDX component `<RrsEditor code={...} />`. Default behaviour matches today's playground (edit + step/play/reset + tree view).
- **Styling:** Tailwind CSS + `@tailwindcss/typography` for prose.
- **Static code blocks:** ` ```rrs ` fences highlighted via the existing `highlight()` function (rehype plugin), no editor instance.
- **Deploy:** GitHub Pages **project page** under repo subpath `/root-rewrite-system-prototype/`.

Out of scope for v1 (deferred): KaTeX math, dark mode toggle, sticky TOC, read-only embed mode, per-block starting term, side-by-side tree layout.

## Target structure (inside `app/`)

```
app/
├─ astro.config.mjs              # MDX, Tailwind, base: '/root-rewrite-system-prototype/'
├─ tailwind.config.mjs
├─ src/
│  ├─ pages/
│  │  ├─ index.astro             # landing + post index
│  │  └─ playground.astro        # full standalone editor (replaces today's app)
│  ├─ layouts/
│  │  ├─ BaseLayout.astro        # shell, nav, fonts
│  │  └─ PostLayout.astro        # prose container w/ typography plugin
│  ├─ content/
│  │  ├─ config.ts               # posts collection schema (title, date, summary)
│  │  └─ posts/                  # *.mdx tutorial posts live here
│  ├─ components/
│  │  ├─ RrsEditor.astro         # MDX-usable embed; renders mount point + script
│  │  └─ PostCard.astro
│  ├─ lib/
│  │  ├─ rrs/                    # MOVED from current app/src/core
│  │  │  ├─ types.ts
│  │  │  ├─ interpreter.ts
│  │  │  ├─ language.ts
│  │  │  └─ rrs3/
│  │  │     ├─ index.ts
│  │  │     ├─ tokenizer.ts
│  │  │     ├─ parser.ts
│  │  │     ├─ validator.ts
│  │  │     ├─ generic-ir.ts
│  │  │     ├─ monomorphize.ts
│  │  │     ├─ highlight.ts          # existing HTML-string output
│  │  │     └─ classify.ts           # NEW: token→class mapping reused by both highlight.ts and CM6
│  │  ├─ tree/                   # MOVED from current app/src/ui
│  │  │  ├─ render.ts            # was tree-render.ts
│  │  │  └─ animate.ts           # was tree-animate.ts
│  │  ├─ session.ts              # NEW: state machine extracted from ui/app.ts
│  │  ├─ editor/
│  │  │  └─ cm-rrs.ts            # NEW: CodeMirror 6 language extension
│  │  └─ embed/
│  │     └─ mount.ts             # NEW: mountRrsEditor(root, opts)
│  └─ styles/global.css          # Tailwind entry + a few editor/tree overrides
└─ .github/workflows/deploy.yml  # GH Pages CI
```

## Work breakdown

### 1. Strip and restructure
- Delete `core/rrs1/`, `core/rrs2/`, `core/languages.ts` (single-language now), `ui/app.ts`, `ui/tree-animate.ts`, `ui/tree-render.ts` originals after they're moved, `style.css`, `index.html`, `main.ts`.
- Move `core/types.ts`, `core/interpreter.ts`, `core/language.ts`, `core/rrs3/*` → `src/lib/rrs/`. Move `ui/tree-*.ts` → `src/lib/tree/`.
- Drop `Language` indirection if helpful (only one language); but keep the `Language` interface for forward-compat with RRS4.

### 2. Astro skeleton
- `npm i astro @astrojs/mdx @astrojs/tailwind tailwindcss @tailwindcss/typography`.
- `astro.config.mjs`: enable MDX + Tailwind, set `site` and `base: '/root-rewrite-system-prototype/'`.
- Content collection in `src/content/config.ts` (schema: `title`, `date`, `summary`, optional `draft`).
- `BaseLayout.astro`, `PostLayout.astro` (`prose` from typography plugin).
- `pages/index.astro` lists posts.
- One sample post `src/content/posts/hello-rrs.mdx` exercising prose + ```rrs block + `<RrsEditor />`.

### 3. Static `rrs` code-fence highlighting
- Tiny **rehype plugin** that walks `<code class="language-rrs">` nodes, runs the source through `lib/rrs/rrs3/highlight.ts`'s `highlight()`, and replaces inner HTML. Plug into Astro's `markdown.rehypePlugins`.
- Reuse existing CSS classes (`.hl-keyword`, `.hl-constructor`, …) defined in `styles/global.css`.

### 4. CodeMirror 6 RRS3 integration
- New `lib/rrs/rrs3/classify.ts`: extract the token-to-class mapping currently inlined in `highlight.ts` so both the static HTML highlighter and the CM6 stream parser share it.
- `lib/editor/cm-rrs.ts`: define a CM6 `StreamLanguage` that calls `tokenize()` per line (or runs the tokenizer once and feeds tokens by line/col) and emits CM tags. Export `rrsLanguage()` extension and a matching `HighlightStyle` mapping our tags to the same colours used in static blocks.
- Deps: `codemirror`, `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`, `@lezer/highlight`.

### 5. Session state machine
- `lib/session.ts`: pull all non-DOM logic out of `ui/app.ts` into a class `RrsSession` with:
  - state: `source`, `rules`, `currentTerm`, `history`, `stepCount`, `status`, `animating`
  - actions: `setSource`, `parse`, `match`, `step` (returns a promise resolved by the embed when the animation finishes), `undo`, `run`
  - subscribers: `on(event, cb)` for `change`, `status`, `step-start`, `step-end`
- No DOM access; depends only on `lib/rrs/*`.

### 6. Embed component
- `components/RrsEditor.astro` props: `code: string`, `height?: string`, `id?: string`.
  Renders:
  ```html
  <div class="rrs-embed" data-rrs-code={code} data-rrs-height={height}>
    <div class="rrs-editor-mount"></div>
    <div class="rrs-controls"></div>
    <div class="rrs-tree"></div>
    <div class="rrs-status"></div>
  </div>
  ```
  followed by `<script>` (Astro client script) that imports `mountRrsEditor` and mounts every `.rrs-embed` on the page.
- `lib/embed/mount.ts`: given a root element + options, instantiate CM6 (with `rrsLanguage`), build buttons, instantiate `RrsSession`, render tree via `lib/tree/render.ts`, drive animations via `lib/tree/animate.ts`. The embed is the *only* place DOM is touched.

### 7. Playground page
- `pages/playground.astro`: full-bleed layout, mounts a single `<RrsEditor />` with a sensible default program (the current `defaultProgram` from `rrs3/index.ts`). One extra control vs. embedded blocks: a "Reset to default" button. This replaces today's `app/index.html` + `ui/app.ts`.

### 8. Tailwind & visual polish
- `tailwind.config.mjs` with typography plugin; configure `prose` colours, code-block contrast, and a font pair (e.g. Inter + JetBrains Mono via `@fontsource`).
- Make sure embedded editors break out of `prose` styling (`.not-prose` wrapper) so Tailwind doesn't restyle the editor's spans/buttons.

### 9. Deploy
- `.github/workflows/deploy.yml` using the official `actions/configure-pages` + `actions/deploy-pages` flow; build with Node 20, run `npm ci && npm run build` in `app/`, upload `app/dist`.
- Confirm asset paths under the `/root-rewrite-system-prototype/` base.

### 10. Update CLAUDE.md
- Replace the "Architecture" section to reflect the Astro layout, `src/lib/rrs/` location, and the `<RrsEditor />` authoring API. Note that the old `core/rrs1` / `core/rrs2` / `monomorphize` references are gone (RRS3 only).

## Key files to reuse as-is

- `core/interpreter.ts` — `match`, `applySubstitution`, `step`, `run` (pure)
- `core/types.ts` — keep verbatim
- `core/rrs3/{tokenizer,parser,validator,generic-ir,monomorphize,highlight}.ts` — pure, drop in
- `ui/tree-render.ts`, `ui/tree-animate.ts` — DOM-coupled but framework-agnostic; called from `mount.ts`

## Verification

1. `cd app && npm run dev` — Astro serves at `http://localhost:4321/root-rewrite-system-prototype/`.
2. Landing page lists the sample post; clicking through renders prose with Tailwind typography.
3. The sample post contains:
   - a static ` ```rrs ` block that's syntax-highlighted with the same colours as the editor;
   - an `<RrsEditor />` whose initial program parses, whose Step/Run buttons advance the term and animate in the inline tree view, whose Undo restores prior state.
4. `/playground` route loads the full editor and reproduces all current playground behaviour against the existing `programs/*.rrs3` samples (paste each, parse + run to a final term).
5. `npm run build` produces `app/dist/` with all asset URLs prefixed by the base path.
6. Deploy workflow runs on push to `main` and the site is reachable at the GH Pages URL.
7. Manual cross-check: open a post on a phone-width viewport — prose readable, editor usable, tree scrolls horizontally if needed.

No automated tests exist in the repo and none are added by this plan.
