import type { Term } from "../core/types";

export const SVG_NS = "http://www.w3.org/2000/svg";

/** Layout constants */
export const NODE_RX = 6;
export const NODE_HEIGHT = 28;
export const NODE_PADDING_X = 14;
export const H_GAP = 16; // horizontal gap between sibling subtrees
export const V_GAP = 48; // vertical gap between levels
export const FONT_SIZE = 14;

/** Layout node produced by the layout pass. */
export interface LayoutNode {
  term: Term;
  width: number; // total width of this subtree
  height: number; // total height of this subtree
  nodeWidth: number; // width of just this node's label box
  x: number; // center x (set during positioning)
  y: number; // top y (set during positioning)
  children: LayoutNode[];
}

/** Measure text width roughly (monospace-ish estimate). */
export function measureLabel(label: string): number {
  return label.length * (FONT_SIZE * 0.62) + NODE_PADDING_X * 2;
}

/** First pass: compute sizes bottom-up. */
export function layoutTree(term: Term): LayoutNode {
  const nodeWidth = measureLabel(term.typeName);
  const childLayouts = term.children.map(layoutTree);

  if (childLayouts.length === 0) {
    return { term, width: nodeWidth, height: NODE_HEIGHT, nodeWidth, x: 0, y: 0, children: [] };
  }

  const childrenTotalWidth =
    childLayouts.reduce((sum, c) => sum + c.width, 0) + H_GAP * (childLayouts.length - 1);
  const width = Math.max(nodeWidth, childrenTotalWidth);
  const childMaxHeight = Math.max(...childLayouts.map((c) => c.height));
  const height = NODE_HEIGHT + V_GAP + childMaxHeight;

  return { term, width, height, nodeWidth, x: 0, y: 0, children: childLayouts };
}

/** Second pass: assign absolute (x, y) positions top-down. */
export function positionTree(node: LayoutNode, cx: number, top: number): void {
  node.x = cx;
  node.y = top;

  if (node.children.length === 0) return;

  const childrenTotalWidth =
    node.children.reduce((sum, c) => sum + c.width, 0) + H_GAP * (node.children.length - 1);
  let childX = cx - childrenTotalWidth / 2;

  for (const child of node.children) {
    const childCx = childX + child.width / 2;
    positionTree(child, childCx, top + NODE_HEIGHT + V_GAP);
    childX += child.width + H_GAP;
  }
}

/** Recursively emit SVG elements for a positioned layout tree. */
function renderNode(
  node: LayoutNode,
  parent: SVGGElement,
  isRoot: boolean,
  highlightRoot: boolean,
): void {
  const g = document.createElementNS(SVG_NS, "g");

  // Draw edges to children first (so they sit behind nodes)
  for (const child of node.children) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(node.x));
    line.setAttribute("y1", String(node.y + NODE_HEIGHT));
    line.setAttribute("x2", String(child.x));
    line.setAttribute("y2", String(child.y));
    line.setAttribute("stroke", "#888");
    line.setAttribute("stroke-width", "1.5");
    g.appendChild(line);
  }

  // Node rectangle
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", String(node.x - node.nodeWidth / 2));
  rect.setAttribute("y", String(node.y));
  rect.setAttribute("width", String(node.nodeWidth));
  rect.setAttribute("height", String(NODE_HEIGHT));
  rect.setAttribute("rx", String(NODE_RX));

  if (isRoot && highlightRoot) {
    rect.setAttribute("fill", "#fde68a");
    rect.setAttribute("stroke", "#f59e0b");
  } else {
    rect.setAttribute("fill", "#e0f2fe");
    rect.setAttribute("stroke", "#38bdf8");
  }
  rect.setAttribute("stroke-width", "1.5");
  g.appendChild(rect);

  // Label
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", String(node.x));
  text.setAttribute("y", String(node.y + NODE_HEIGHT / 2));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.setAttribute("font-size", String(FONT_SIZE));
  text.setAttribute("font-family", "monospace");
  text.setAttribute("fill", "#1e293b");
  text.textContent = node.term.typeName;
  g.appendChild(text);

  parent.appendChild(g);

  // Render children
  for (const child of node.children) {
    renderNode(child, parent, false, highlightRoot);
  }
}

/**
 * Render a Term as an SVG tree into the given container element.
 * Replaces any existing content in the container.
 *
 * @param term - The term to render
 * @param container - The DOM element to render into
 * @param highlightRoot - If true, the root node is highlighted (e.g. after a rewrite)
 */
export function renderTree(term: Term, container: HTMLElement, highlightRoot = false): void {
  container.innerHTML = "";

  const layout = layoutTree(term);
  const padding = 20;

  // Root is anchored at absolute x=0 so that successive renders never shift
  // the root horizontally. The viewBox uses a negative x to include the
  // tree's left half.
  positionTree(layout, 0, 0);

  const vbX = -layout.width / 2 - padding;
  const vbWidth = layout.width + padding * 2;
  const topClip = 2;
  const vbHeight = layout.height + padding + topClip;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("viewBox", `${vbX} ${-topClip} ${vbWidth} ${vbHeight}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
  svg.style.display = "block";
  svg.style.maxWidth = `${vbWidth}px`;
  svg.style.maxHeight = `${vbHeight}px`;
  svg.style.margin = "16px auto 0";

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  svg.appendChild(g);

  renderNode(layout, g, true, highlightRoot);
  container.appendChild(svg);
}
