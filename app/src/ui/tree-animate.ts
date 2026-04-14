import type { Term, TermVar, Rule } from "../core/types";
import {
  SVG_NS, NODE_RX, NODE_HEIGHT, FONT_SIZE,
  type LayoutNode, layoutTree, positionTree,
} from "./tree-render";

// ── Colors ──────────────────────────────────────────────────────────────

const RULE_FILL = "#fef3c7";
const RULE_STROKE = "#f59e0b";
const EDGE_COLOR = "#888";

/** 8-color palette for variable subtrees (fill, stroke). */
const VAR_PALETTE: Array<{ fill: string; stroke: string }> = [
  { fill: "#ede9fe", stroke: "#8b5cf6" }, // violet
  { fill: "#dbeafe", stroke: "#3b82f6" }, // blue
  { fill: "#d1fae5", stroke: "#10b981" }, // emerald
  { fill: "#fce7f3", stroke: "#ec4899" }, // pink
  { fill: "#ffedd5", stroke: "#f97316" }, // orange
  { fill: "#e0e7ff", stroke: "#6366f1" }, // indigo
  { fill: "#ccfbf1", stroke: "#14b8a6" }, // teal
  { fill: "#fef9c3", stroke: "#eab308" }, // yellow
];

// ── Timing ──────────────────────────────────────────────────────────────

const HIGHLIGHT_MS = 500;
const MOVE_MS = 800;

// ── Annotation ──────────────────────────────────────────────────────────

type NodeRole =
  | { kind: "rule-structure" }
  | { kind: "variable"; name: string };

interface AnnotatedNode {
  layout: LayoutNode;
  role: NodeRole;
  children: AnnotatedNode[]; // empty when role is variable (subtree is opaque)
}

/** Walk a pattern and a layout tree in parallel, classifying each node. */
function annotateTree(pattern: TermVar, layout: LayoutNode): AnnotatedNode {
  if (pattern.kind === "variable") {
    return { layout, role: { kind: "variable", name: pattern.name }, children: [] };
  }
  const children = pattern.children.map((cp, i) => annotateTree(cp, layout.children[i]));
  return { layout, role: { kind: "rule-structure" }, children };
}

/** Collect variable name → layout root from an annotated tree. */
function collectVarLayouts(node: AnnotatedNode): Map<string, LayoutNode> {
  const map = new Map<string, LayoutNode>();
  function walk(n: AnnotatedNode) {
    if (n.role.kind === "variable") {
      map.set(n.role.name, n.layout);
    } else {
      for (const c of n.children) walk(c);
    }
  }
  walk(node);
  return map;
}

/** Collect all rule-structure LayoutNodes. */
function collectRuleNodes(node: AnnotatedNode): LayoutNode[] {
  const nodes: LayoutNode[] = [];
  function walk(n: AnnotatedNode) {
    if (n.role.kind === "rule-structure") {
      nodes.push(n.layout);
      for (const c of n.children) walk(c);
    }
  }
  walk(node);
  return nodes;
}

// ── SVG helpers ─────────────────────────────────────────────────────────

function createNodeRect(x: number, y: number, w: number, fill: string, stroke: string): SVGRectElement {
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", String(x - w / 2));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(w));
  rect.setAttribute("height", String(NODE_HEIGHT));
  rect.setAttribute("rx", String(NODE_RX));
  rect.setAttribute("fill", fill);
  rect.setAttribute("stroke", stroke);
  rect.setAttribute("stroke-width", "1.5");
  return rect;
}

function createNodeText(x: number, y: number, label: string): SVGTextElement {
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y + NODE_HEIGHT / 2));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.setAttribute("font-size", String(FONT_SIZE));
  text.setAttribute("font-family", "monospace");
  text.setAttribute("fill", "#1e293b");
  text.textContent = label;
  return text;
}

function createEdge(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", EDGE_COLOR);
  line.setAttribute("stroke-width", "1.5");
  return line;
}

/** Render a full subtree (used for variable subtrees) into a new <g>. */
function renderSubtreeGroup(layout: LayoutNode, fill: string, stroke: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g");
  function walk(node: LayoutNode) {
    // edges to children
    for (const child of node.children) {
      g.appendChild(createEdge(node.x, node.y + NODE_HEIGHT, child.x, child.y));
    }
    // node box + label
    g.appendChild(createNodeRect(node.x, node.y, node.nodeWidth, fill, stroke));
    g.appendChild(createNodeText(node.x, node.y, node.term.typeName));
    // recurse
    for (const child of node.children) walk(child);
  }
  walk(layout);
  return g;
}

const NORMAL_FILL = "#e0f2fe";
const NORMAL_STROKE = "#38bdf8";

/** Render a positioned layout tree into an SVG group with normal (blue) colors. */
function renderLayoutInto(node: LayoutNode, parent: SVGGElement): void {
  const g = document.createElementNS(SVG_NS, "g");
  for (const child of node.children) {
    g.appendChild(createEdge(node.x, node.y + NODE_HEIGHT, child.x, child.y));
  }
  g.appendChild(createNodeRect(node.x, node.y, node.nodeWidth, NORMAL_FILL, NORMAL_STROKE));
  g.appendChild(createNodeText(node.x, node.y, node.term.typeName));
  parent.appendChild(g);
  for (const child of node.children) {
    renderLayoutInto(child, parent);
  }
}

// ── Easing ──────────────────────────────────────────────────────────────

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Collect edges from an annotated tree between rule-structure nodes and their children
 *  (which can be either rule-structure or variable subtrees). */
function collectAnnotatedEdges(node: AnnotatedNode): Array<{ parent: LayoutNode; child: AnnotatedNode }> {
  const edges: Array<{ parent: LayoutNode; child: AnnotatedNode }> = [];
  function walk(n: AnnotatedNode) {
    if (n.role.kind === "rule-structure") {
      for (const c of n.children) {
        edges.push({ parent: n.layout, child: c });
        walk(c);
      }
    }
  }
  walk(node);
  return edges;
}

// ── Match highlight ─────────────────────────────────────────────────────

/** Render the current term with pattern-match coloring, without advancing state. */
export function highlightMatch(
  term: Term,
  rule: Rule,
  container: HTMLElement,
): void {
  const padding = 20;
  const layout = layoutTree(term);
  positionTree(layout, 0, 0);

  const annotated = annotateTree(rule.left, layout);
  const varLayouts = collectVarLayouts(annotated);

  const vbX = -layout.width / 2 - padding;
  const vbWidth = layout.width + padding * 2;
  const vbHeight = layout.height + padding;

  container.innerHTML = "";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("viewBox", `${vbX} 0 ${vbWidth} ${vbHeight}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
  svg.style.display = "block";
  svg.style.maxWidth = `${vbWidth}px`;
  svg.style.maxHeight = `${vbHeight}px`;
  svg.style.margin = "auto";
  container.appendChild(svg);

  const rootG = document.createElementNS(SVG_NS, "g") as SVGGElement;
  svg.appendChild(rootG);

  // Edges between rule-structure nodes and their children
  for (const e of collectAnnotatedEdges(annotated)) {
    rootG.appendChild(createEdge(e.parent.x, e.parent.y + NODE_HEIGHT, e.child.layout.x, e.child.layout.y));
  }

  // Rule-structure nodes in yellow
  for (const rn of collectRuleNodes(annotated)) {
    const g = document.createElementNS(SVG_NS, "g");
    g.appendChild(createNodeRect(rn.x, rn.y, rn.nodeWidth, RULE_FILL, RULE_STROKE));
    g.appendChild(createNodeText(rn.x, rn.y, rn.term.typeName));
    rootG.appendChild(g);
  }

  // Variable subtrees in palette colors
  let colorIdx = 0;
  for (const varLayout of varLayouts.values()) {
    const c = VAR_PALETTE[colorIdx % VAR_PALETTE.length];
    rootG.appendChild(renderSubtreeGroup(varLayout, c.fill, c.stroke));
    colorIdx++;
  }
}

// ── Main animation ──────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function animateStep(
  oldTerm: Term,
  newTerm: Term,
  rule: Rule,
  _substitution: Map<string, Term>,
  container: HTMLElement,
): Promise<void> {
  // ── Layout both trees ──
  const padding = 20;

  const oldLayout = layoutTree(oldTerm);
  const newLayout = layoutTree(newTerm);

  // Both trees anchor their root at absolute x=0 in SVG coordinates. The
  // viewBox is shifted by a negative x so the tree is visually centered.
  // We interpolate the viewBox from old bounds to new bounds during the
  // move phase so the visible area smoothly resizes.
  positionTree(oldLayout, 0, 0);
  positionTree(newLayout, 0, 0);

  // ── Annotate ──
  const oldAnnotated = annotateTree(rule.left, oldLayout);
  const newAnnotated = annotateTree(rule.right, newLayout);

  const oldVarLayouts = collectVarLayouts(oldAnnotated);
  const newVarLayouts = collectVarLayouts(newAnnotated);

  // ── viewBox bounds for old and new ──
  const oldVb = {
    x: -oldLayout.width / 2 - padding,
    w: oldLayout.width + padding * 2,
    h: oldLayout.height + padding,
  };
  const newVb = {
    x: -newLayout.width / 2 - padding,
    w: newLayout.width + padding * 2,
    h: newLayout.height + padding,
  };

  container.innerHTML = "";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("viewBox", `${oldVb.x} 0 ${oldVb.w} ${oldVb.h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
  svg.style.display = "block";
  svg.style.maxWidth = `${oldVb.w}px`;
  svg.style.maxHeight = `${oldVb.h}px`;
  svg.style.margin = "auto";
  container.appendChild(svg);

  const rootG = document.createElementNS(SVG_NS, "g") as SVGGElement;
  svg.appendChild(rootG);

  // ── Phase 1: Highlight old tree ──

  // Render old rule-structure nodes
  const oldRuleNodes = collectRuleNodes(oldAnnotated);
  const oldRuleGs: SVGGElement[] = [];
  for (const rn of oldRuleNodes) {
    const g = document.createElementNS(SVG_NS, "g");
    g.appendChild(createNodeRect(rn.x, rn.y, rn.nodeWidth, RULE_FILL, RULE_STROKE));
    g.appendChild(createNodeText(rn.x, rn.y, rn.term.typeName));
    rootG.appendChild(g);
    oldRuleGs.push(g);
  }

  // Render old edges (between rule-structure nodes and their children)
  const oldEdges = collectAnnotatedEdges(oldAnnotated);
  const oldEdgeLines: SVGLineElement[] = [];
  for (const e of oldEdges) {
    const childLayout = e.child.layout;
    const line = createEdge(e.parent.x, e.parent.y + NODE_HEIGHT, childLayout.x, childLayout.y);
    rootG.appendChild(line);
    oldEdgeLines.push(line);
  }

  // Assign each variable a distinct color from the palette
  const varColors = new Map<string, { fill: string; stroke: string }>();
  let colorIdx = 0;
  for (const name of oldVarLayouts.keys()) {
    varColors.set(name, VAR_PALETTE[colorIdx % VAR_PALETTE.length]);
    colorIdx++;
  }

  // Render variable subtrees as movable groups
  const varGroups = new Map<string, SVGGElement>();
  for (const [name, layout] of oldVarLayouts) {
    const c = varColors.get(name)!;
    const g = renderSubtreeGroup(layout, c.fill, c.stroke);
    rootG.appendChild(g);
    varGroups.set(name, g);
  }

  await delay(HIGHLIGHT_MS);

  // ── Phase 2: Move ──

  // Prepare new rule-structure nodes (invisible, at their final positions)
  const newRuleNodes = collectRuleNodes(newAnnotated);
  const newRuleGs: SVGGElement[] = [];
  for (const rn of newRuleNodes) {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("opacity", "0");
    g.appendChild(createNodeRect(rn.x, rn.y, rn.nodeWidth, RULE_FILL, RULE_STROKE));
    g.appendChild(createNodeText(rn.x, rn.y, rn.term.typeName));
    rootG.appendChild(g);
    newRuleGs.push(g);
  }

  // Prepare new edges (between new rule-structure and variable landing positions)
  const newEdges = collectAnnotatedEdges(newAnnotated);
  const newEdgeLines: SVGLineElement[] = [];
  for (const e of newEdges) {
    const childLayout = e.child.layout;
    const line = createEdge(e.parent.x, e.parent.y + NODE_HEIGHT, childLayout.x, childLayout.y);
    line.setAttribute("opacity", "0");
    rootG.appendChild(line);
    newEdgeLines.push(line);
  }

  // Compute variable motion vectors
  const varMotions: Array<{ name: string; dx: number; dy: number; group: SVGGElement }> = [];
  for (const [name, oldLay] of oldVarLayouts) {
    const newLay = newVarLayouts.get(name);
    const group = varGroups.get(name)!;
    if (newLay) {
      varMotions.push({ name, dx: newLay.x - oldLay.x, dy: newLay.y - oldLay.y, group });
    } else {
      // Variable erased — fade out
      varMotions.push({ name, dx: 0, dy: 0, group });
    }
  }

  // Find erased variables (in old but not in new)
  const erasedVars = new Set<string>();
  for (const name of oldVarLayouts.keys()) {
    if (!newVarLayouts.has(name)) erasedVars.add(name);
  }

  // Animate with rAF
  await new Promise<void>(resolve => {
    const start = performance.now();
    function tick(now: number) {
      const rawT = Math.min((now - start) / MOVE_MS, 1);
      const t = easeInOutCubic(rawT);

      // Move variable subtrees
      for (const vm of varMotions) {
        const isErased = erasedVars.has(vm.name);
        const tx = vm.dx * t;
        const ty = vm.dy * t;
        vm.group.setAttribute("transform", `translate(${tx}, ${ty})`);
        if (isErased) {
          vm.group.setAttribute("opacity", String(1 - t));
        }
      }

      // Fade out old rule-structure nodes
      for (const g of oldRuleGs) {
        g.setAttribute("opacity", String(1 - t));
      }

      // Fade out old edges
      for (const line of oldEdgeLines) {
        line.setAttribute("opacity", String(1 - t));
      }

      // Fade in new rule-structure nodes
      for (const g of newRuleGs) {
        g.setAttribute("opacity", String(t));
      }

      // Fade in new edges
      for (const line of newEdgeLines) {
        line.setAttribute("opacity", String(t));
      }

      // Interpolate viewBox so the visible area grows/shrinks smoothly.
      const curX = oldVb.x + (newVb.x - oldVb.x) * t;
      const curW = oldVb.w + (newVb.w - oldVb.w) * t;
      const curH = oldVb.h + (newVb.h - oldVb.h) * t;
      svg.setAttribute("viewBox", `${curX} 0 ${curW} ${curH}`);
      svg.style.maxWidth = `${curW}px`;
      svg.style.maxHeight = `${curH}px`;

      if (rawT < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });

  // ── Settle: re-render new tree in-place with normal colors ──
  // The viewBox is already at new bounds (animation ended at t=1), so no
  // dimension change is needed — just swap the DOM content.
  while (rootG.firstChild) rootG.removeChild(rootG.firstChild);
  renderLayoutInto(newLayout, rootG);
}
