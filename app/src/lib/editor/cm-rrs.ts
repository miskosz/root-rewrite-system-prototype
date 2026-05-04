import { ViewPlugin, Decoration, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { classify } from "../rrs/rrs3/classify";

const rrsHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const source = view.state.doc.toString();
  const tokens = classify(source);
  for (const t of tokens) {
    builder.add(t.start, t.end, Decoration.mark({ class: `hl-${t.cls}` }));
  }
  return builder.finish();
}

export function rrsLanguage(): Extension {
  return [rrsHighlighter];
}
