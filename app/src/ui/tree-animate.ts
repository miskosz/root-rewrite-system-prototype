import type { Term, TermVar, Rule } from "../core/types";
import {
  SVG_NS, NODE_RX, NODE_HEIGHT, FONT_SIZE,
  type LayoutNode, layoutTree, positionTree,
} from "./tree-render";
import { renderTree } from "./tree-render";

// ── Colors ──────────────────────────────────────────────────────────────

const VAR_FILL = "#ede9fe";
const VAR_STROKE = "#8b5cf6";
const RULE_FILL = "#fef3c7";
const RULE_STROKE = "#f59e0b";
const EDGE_COLOR = "#888";

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
  positionTree(oldLayout, oldLayout.width / 2 + padding, padding);

  const newLayout = layoutTree(newTerm);
  positionTree(newLayout, newLayout.width / 2 + padding, padding);

  // ── Annotate ──
  const oldAnnotated = annotateTree(rule.left, oldLayout);
  const newAnnotated = annotateTree(rule.right, newLayout);

  const oldVarLayouts = collectVarLayouts(oldAnnotated);
  const newVarLayouts = collectVarLayouts(newAnnotated);

  // ── SVG setup ──
  const svgWidth = Math.max(oldLayout.width, newLayout.width) + padding * 2;
  const svgHeight = Math.max(oldLayout.height, newLayout.height) + padding * 2;

  container.innerHTML = "";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(svgWidth));
  svg.setAttribute("height", String(svgHeight));
  svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
  svg.style.display = "block";
  svg.style.margin = "0 auto";
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

  // Render variable subtrees as movable groups
  const varGroups = new Map<string, SVGGElement>();
  for (const [name, layout] of oldVarLayouts) {
    const g = renderSubtreeGroup(layout, VAR_FILL, VAR_STROKE);
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

      if (rawT < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });

  // ── Settle: clean render ──
  renderTree(newTerm, container);
}
