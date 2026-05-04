import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { rrsLanguage } from "../editor/cm-rrs";
import { RrsSession, type SessionStatus } from "../session";
import { renderTree } from "../tree/render";
import { animateStep, highlightMatch } from "../tree/animate";

export interface MountOptions {
  initialCode: string;
  height?: string;
  showResetButton?: boolean;
}

export function mountRrsEditor(root: HTMLElement, opts: MountOptions): void {
  const editorMount = root.querySelector<HTMLElement>(".rrs-editor-mount")!;
  const controlsEl = root.querySelector<HTMLElement>(".rrs-controls")!;
  const treeEl = root.querySelector<HTMLElement>(".rrs-tree")! as HTMLElement;
  const statusEl = root.querySelector<HTMLElement>(".rrs-status")!;

  const session = new RrsSession();

  if (opts.height) {
    editorMount.style.height = opts.height;
  }

  const view = new EditorView({
    parent: editorMount,
    state: EditorState.create({
      doc: opts.initialCode,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        rrsLanguage(),
        EditorView.theme({
          "&": opts.height ? { height: opts.height } : {},
          ".cm-scroller": { overflow: "auto" },
        }),
      ],
    }),
  });

  // Build buttons
  const mkBtn = (label: string, primary = false) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (primary) b.classList.add("primary");
    return b;
  };
  const btnLoad = mkBtn("Load", true);
  const btnMatch = mkBtn("Match");
  const btnStep = mkBtn("Step");
  const btnUndo = mkBtn("Undo");
  const btnRun = mkBtn("Run");
  const btnReset = opts.showResetButton ? mkBtn("Reset") : null;
  controlsEl.append(btnLoad, btnMatch, btnStep, btnUndo, btnRun);
  if (btnReset) controlsEl.append(btnReset);

  const setStepEnabled = (enabled: boolean) => {
    btnMatch.disabled = !enabled;
    btnStep.disabled = !enabled;
    btnRun.disabled = !enabled;
  };
  setStepEnabled(false);
  btnUndo.disabled = true;

  let justStepped = false;

  const renderCurrent = () => {
    if (session.term) renderTree(session.term, treeEl, justStepped);
    else treeEl.innerHTML = "";
  };

  const formatStatus = (s: SessionStatus): { text: string; cls: string } => {
    switch (s.kind) {
      case "idle": return { text: "Press Load to parse the program.", cls: "" };
      case "ready": return { text: `Parsed — ${s.ruleCount} rule(s). Step ${s.stepCount}.`, cls: "success" };
      case "matched": return { text: `Rule ${s.ruleIndex + 1} matches`, cls: "success" };
      case "stepped": return { text: `Step ${s.stepCount}: rule ${s.ruleIndex + 1} matched`, cls: "success" };
      case "normal-form": return { text: `Normal form reached after ${s.stepCount} step(s)`, cls: "success" };
      case "limit-reached": return { text: `Stopped after ${s.limit} steps. Total: ${s.stepCount}`, cls: "error" };
      case "error": return { text: s.message, cls: "error" };
    }
  };

  session.on("status", (s) => {
    const { text, cls } = formatStatus(s);
    statusEl.textContent = text;
    statusEl.className = `rrs-status ${cls}`.trim();
    btnUndo.disabled = !session.canUndo;
    if (s.kind === "normal-form" || s.kind === "limit-reached") {
      btnMatch.disabled = true;
      btnStep.disabled = true;
      btnRun.disabled = true;
    } else if (s.kind === "ready" || s.kind === "matched" || s.kind === "stepped") {
      setStepEnabled(true);
    } else if (s.kind === "error" || s.kind === "idle") {
      setStepEnabled(false);
    }
  });

  session.on("change", () => {
    renderCurrent();
  });

  session.on("matchPreview", (rule) => {
    if (session.term) highlightMatch(session.term, rule, treeEl);
  });

  session.on("step", async ({ oldTerm, newTerm, rule, substitution }) => {
    setStepEnabled(false);
    btnUndo.disabled = true;
    await animateStep(oldTerm, newTerm, rule, substitution, treeEl);
    justStepped = true;
  });

  btnLoad.addEventListener("click", () => {
    justStepped = false;
    session.parse(view.state.doc.toString());
  });
  btnMatch.addEventListener("click", () => {
    justStepped = false;
    session.match();
  });
  btnStep.addEventListener("click", () => {
    void session.step();
  });
  btnUndo.addEventListener("click", () => {
    justStepped = false;
    session.undo();
  });
  btnRun.addEventListener("click", () => {
    session.run();
  });
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: opts.initialCode } });
      justStepped = false;
      session.parse(opts.initialCode);
    });
  }

  // Auto-load on mount
  session.parse(opts.initialCode);
}

export function mountAll(): void {
  document.querySelectorAll<HTMLElement>(".rrs-embed").forEach((el) => {
    if (el.dataset.rrsMounted === "1") return;
    el.dataset.rrsMounted = "1";
    const code = el.dataset.rrsCode ?? "";
    const height = el.dataset.rrsHeight;
    const showReset = el.dataset.rrsReset === "1";
    mountRrsEditor(el, { initialCode: code, height, showResetButton: showReset });
  });
}
