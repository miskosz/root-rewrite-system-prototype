import type { Root, Element, Text } from "hast";
import { visit } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import { highlight } from "./rrs/rrs3/highlight";

export function rehypeRrs() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "code") return;
      const className = (node.properties?.className ?? []) as string[];
      if (!className.includes("language-rrs")) return;

      const source = (node.children ?? [])
        .filter((c): c is Text => c.type === "text")
        .map((c) => c.value)
        .join("");

      const html = highlight(source);
      const fragment = fromHtml(html, { fragment: true });
      node.children = fragment.children as any;

      const parent = (node as any).__parent as Element | undefined;
      if (parent && parent.tagName === "pre") {
        parent.properties = parent.properties ?? {};
        const cls = (parent.properties.className ?? []) as string[];
        if (!cls.includes("rrs-static")) cls.push("rrs-static");
        parent.properties.className = cls;
      }
    });

    // Second pass to add `rrs-static` class to <pre> wrappers
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "pre") return;
      const child = (node.children ?? []).find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!child) return;
      const cls = ((child.properties?.className ?? []) as string[]) ?? [];
      if (!cls.includes("language-rrs")) return;
      node.properties = node.properties ?? {};
      const parentCls = (node.properties.className ?? []) as string[];
      if (!parentCls.includes("rrs-static")) parentCls.push("rrs-static");
      node.properties.className = parentCls;
    });
  };
}
