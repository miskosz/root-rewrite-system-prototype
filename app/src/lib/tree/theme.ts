function v(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export const treeTheme = {
  edge:         () => v("--color-tree-edge"),
  nodeText:     () => v("--color-tree-node-text"),
  normalFill:   () => v("--color-tree-normal-fill"),
  normalStroke: () => v("--color-tree-normal-stroke"),
  ruleFill:     () => v("--color-tree-rule-fill"),
  ruleFillSoft: () => v("--color-tree-rule-fill-soft"),
  ruleStroke:   () => v("--color-tree-rule-stroke"),
  varPalette:   (): Array<{ fill: string; stroke: string }> =>
    Array.from({ length: 8 }, (_, i) => ({
      fill:   v(`--color-var-${i + 1}-fill`),
      stroke: v(`--color-var-${i + 1}-stroke`),
    })),
};
