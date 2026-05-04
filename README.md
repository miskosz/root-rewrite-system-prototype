# Root Rewrite Systems

Tutorial site and interpreter for **Root Rewrite Systems (RRS)** — a small computation model, an alternative to e.g. a Turing machine. RRS rewrites typed terms by matching patterns at the root and applying the first matching rule.

**Website:** https://miskosz.github.io/root-rewrite-system-prototype/

The formal definition prototype lives in [`rrs_definition.md`](rrs_definition.md). Sample programs live in [`programs/`](programs/). The site source is in [`app/`](app/) (Astro + MDX).

## Development

```sh
cd app
npm install
npm run dev
```
