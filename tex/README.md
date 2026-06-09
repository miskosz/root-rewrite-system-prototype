# RRS LaTeX notes

A collection of independent topic documents, built with
[Tectonic](https://tectonic-typesetting.github.io/). **Each `.tex` file in
`topics/` compiles to its own PDF** in `build/`. Shared packages, theorem
environments, and notation macros live in `topics/rrs.sty`, pulled in with
`\usepackage{rrs}`.

```
tex/
├─ topics/
│  ├─ rrs.sty          # shared preamble: packages, theorems, \Terms, \Sig, ...
│  ├─ definitions.tex  # → build/definitions.pdf
│  └─ scratch.tex      # → build/scratch.pdf
├─ build/              # generated PDFs (gitignored)
└─ Makefile
```

`rrs.sty` sits in `topics/` (next to the documents) on purpose: Tectonic
searches the input file's own directory for packages, so `\usepackage{rrs}`
resolves with no path configuration.

## Building

```sh
make                     # build every topic into build/
make build/scratch.pdf   # build one topic
make watch               # rebuild on save
make clean               # remove build/
```

Requires Tectonic (`brew install tectonic`). On first run it auto-downloads the
packages each document uses and caches them.

## Adding a topic

Drop a new file in `topics/`, starting from:

```latex
\documentclass[11pt]{article}
\usepackage{rrs}
\begin{document}
% ...
\end{document}
```

`make` picks it up automatically and produces `build/<name>.pdf`. Put any shared
macros or environments in `topics/rrs.sty` so every topic can use them.
