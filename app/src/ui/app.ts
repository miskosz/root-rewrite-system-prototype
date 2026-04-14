import { LANGUAGES, getLanguage } from "../core/languages";
import { ParseError, type Language } from "../core/language";
import { step } from "../core/interpreter";
import { renderTree } from "./tree-render";
import { animateStep, highlightMatch } from "./tree-animate";
import type { Term, Rule } from "../core/types";

export function initApp(): void {
  const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
  const treeContainer = document.getElementById("tree-container")!;
  const statusBar = document.getElementById("status-bar")!;
  const btnParse = document.getElementById("btn-parse") as HTMLButtonElement;
  const btnMatch = document.getElementById("btn-match") as HTMLButtonElement;
  const btnStep = document.getElementById("btn-step") as HTMLButtonElement;
  const btnRun = document.getElementById("btn-run") as HTMLButtonElement;

  // Resize handle logic
  const editorPane = document.getElementById("editor-pane")!;
  const resizeHandle = document.getElementById("resize-handle")!;

  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    resizeHandle.classList.add("dragging");
    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(e.clientX, window.innerWidth - 200));
      editorPane.style.flex = 'none';
      editorPane.style.width = `${newWidth}px`;
    };
    const onMouseUp = () => {
      resizeHandle.classList.remove("dragging");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  const highlightCode = document.getElementById("highlight-code")!;

  const STORAGE_LANG_KEY = "rrs:lang";
  const sourceKey = (langId: string) => `rrs:source:${langId}`;

  const savedLangId = localStorage.getItem(STORAGE_LANG_KEY);
  let currentLanguage: Language =
    (savedLangId && LANGUAGES.find((l) => l.id === savedLangId)) || LANGUAGES[0];

  function loadSourceFor(lang: Language): string {
    return localStorage.getItem(sourceKey(lang.id)) ?? lang.defaultProgram;
  }

  function updateHighlight() {
    highlightCode.innerHTML = currentLanguage.highlight(sourceEl.value);
  }

  sourceEl.value = loadSourceFor(currentLanguage);
  updateHighlight();

  const langRadioForCurrent = document.querySelector<HTMLInputElement>(
    `input[name="lang"][value="${currentLanguage.id}"]`,
  );
  if (langRadioForCurrent) langRadioForCurrent.checked = true;

  sourceEl.addEventListener("input", () => {
    updateHighlight();
    localStorage.setItem(sourceKey(currentLanguage.id), sourceEl.value);
  });

  // Sync scroll between textarea and highlight layer
  const highlightLayer = document.getElementById("highlight-layer")!;
  sourceEl.addEventListener("scroll", () => {
    highlightLayer.scrollTop = sourceEl.scrollTop;
    highlightLayer.scrollLeft = sourceEl.scrollLeft;
  });

  // Using the deprecated execCommand is intentional: it is the only API that
  // preserves the textarea's native undo history for programmatic edits.
  const insertText = (text: string) =>
    (document as any).execCommand("insertText", false, text);

  // Expand [selStart, selEnd] to the full lines it touches. If the selection
  // ends at column 0 of a line, that trailing line is not included.
  function lineBlockBounds(text: string, selStart: number, selEnd: number) {
    let effEnd = selEnd;
    if (effEnd > selStart && text[effEnd - 1] === "\n") effEnd--;
    const start = text.lastIndexOf("\n", selStart - 1) + 1;
    let end = text.indexOf("\n", effEnd);
    if (end === -1) end = text.length;
    return { start, end };
  }

  function replaceLineBlock(
    transform: (lines: string[]) => { lines: string[]; caretDeltas: (lineIdx: number) => number },
  ) {
    const text = sourceEl.value;
    const selStart = sourceEl.selectionStart;
    const selEnd = sourceEl.selectionEnd;
    const { start, end } = lineBlockBounds(text, selStart, selEnd);
    const oldLines = text.substring(start, end).split("\n");
    const { lines: newLines, caretDeltas } = transform(oldLines);

    const lineIndexOf = (offset: number) => {
      if (offset <= start) return 0;
      if (offset >= end) return oldLines.length - 1;
      return text.substring(start, offset).split("\n").length - 1;
    };
    const offsetInLine = (offset: number, lineIdx: number) => {
      const lineStart =
        start +
        oldLines.slice(0, lineIdx).reduce((n, l) => n + l.length + 1, 0);
      return offset - lineStart;
    };

    const selStartLine = lineIndexOf(selStart);
    const selEndLine = lineIndexOf(selEnd);
    const selStartCol = offsetInLine(selStart, selStartLine);
    const selEndCol = offsetInLine(selEnd, selEndLine);

    sourceEl.setSelectionRange(start, end);
    insertText(newLines.join("\n"));

    const newLineStart = (lineIdx: number) =>
      start +
      newLines.slice(0, lineIdx).reduce((n, l) => n + l.length + 1, 0);

    const clampCol = (lineIdx: number, col: number) =>
      Math.max(0, Math.min(newLines[lineIdx].length, col + caretDeltas(lineIdx)));

    const newSelStart = newLineStart(selStartLine) + clampCol(selStartLine, selStartCol);
    const newSelEnd = newLineStart(selEndLine) + clampCol(selEndLine, selEndCol);
    sourceEl.setSelectionRange(newSelStart, newSelEnd);
  }

  function indentSelection() {
    replaceLineBlock((lines) => ({
      lines: lines.map((l) => "    " + l),
      caretDeltas: () => 4,
    }));
  }

  function unindentSelection() {
    const removed: number[] = [];
    replaceLineBlock((lines) => {
      const out = lines.map((l) => {
        let i = 0;
        while (i < 4 && l[i] === " ") i++;
        removed.push(i);
        return l.substring(i);
      });
      return { lines: out, caretDeltas: (idx) => -removed[idx] };
    });
  }

  const COMMENT_PREFIX = "# ";

  function toggleComment() {
    const added: number[] = [];
    replaceLineBlock((lines) => {
      const nonEmpty = lines.filter((l) => l.trim().length > 0);
      const allCommented =
        nonEmpty.length > 0 && nonEmpty.every((l) => l.trimStart().startsWith("#"));

      if (allCommented) {
        const out = lines.map((l) => {
          const leading = l.length - l.trimStart().length;
          const rest = l.substring(leading);
          if (!rest.startsWith("#")) {
            added.push(0);
            return l;
          }
          let remove = 1;
          if (rest[1] === " ") remove = 2;
          added.push(-remove);
          return l.substring(0, leading) + rest.substring(remove);
        });
        return { lines: out, caretDeltas: (idx) => added[idx] };
      } else {
        const minIndent = Math.min(
          ...lines
            .filter((l) => l.trim().length > 0)
            .map((l) => l.length - l.trimStart().length),
        );
        const indent = Number.isFinite(minIndent) ? minIndent : 0;
        const out = lines.map((l) => {
          if (l.trim().length === 0) {
            added.push(0);
            return l;
          }
          added.push(COMMENT_PREFIX.length);
          return l.substring(0, indent) + COMMENT_PREFIX + l.substring(indent);
        });
        return { lines: out, caretDeltas: (idx) => added[idx] };
      }
    });
  }

  sourceEl.addEventListener("keydown", (e) => {
    const selStart = sourceEl.selectionStart;
    const selEnd = sourceEl.selectionEnd;
    const multiLineSelection =
      selStart !== selEnd &&
      sourceEl.value.substring(selStart, selEnd).includes("\n");

    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (multiLineSelection) indentSelection();
      else insertText("    ");
      return;
    }

    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      unindentSelection();
      return;
    }

    if (e.key === "/" && e.metaKey) {
      e.preventDefault();
      toggleComment();
      return;
    }

    if (e.key === "Enter" && !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
      const text = sourceEl.value;
      const lineStart = text.lastIndexOf("\n", selStart - 1) + 1;
      let indentEnd = lineStart;
      while (indentEnd < selStart && text[indentEnd] === " ") indentEnd++;
      const indent = text.substring(lineStart, indentEnd);
      if (indent.length > 0) {
        e.preventDefault();
        insertText("\n" + indent);
        return;
      }
    }

    if (e.key === "Backspace" && !e.metaKey && !e.altKey && !e.ctrlKey && selStart === selEnd) {
      const text = sourceEl.value;
      const lineStart = text.lastIndexOf("\n", selStart - 1) + 1;
      const col = selStart - lineStart;
      if (col >= 4 && col % 4 === 0 && text.substring(selStart - 4, selStart) === "    ") {
        e.preventDefault();
        sourceEl.setSelectionRange(selStart - 4, selStart);
        insertText("");
        return;
      }
    }
  });

  let rules: Rule[] = [];
  let currentTerm: Term | null = null;
  let stepCount = 0;
  let justStepped = false;
  let animating = false;

  function setStatus(msg: string, kind: "" | "error" | "success" = "") {
    statusBar.textContent = msg;
    statusBar.className = kind;
  }

  function setStepControls(enabled: boolean) {
    btnMatch.disabled = !enabled;
    btnStep.disabled = !enabled;
    btnRun.disabled = !enabled;
  }

  function renderCurrent() {
    if (currentTerm) {
      renderTree(currentTerm, treeContainer, justStepped);
    }
  }

  // Language selector
  const langRadios = document.querySelectorAll<HTMLInputElement>('input[name="lang"]');
  langRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      currentLanguage = getLanguage(radio.value);
      localStorage.setItem(STORAGE_LANG_KEY, currentLanguage.id);

      // Reset interpreter state
      rules = [];
      currentTerm = null;
      stepCount = 0;
      justStepped = false;
      animating = false;

      treeContainer.innerHTML = "";
      setStepControls(false);

      sourceEl.value = loadSourceFor(currentLanguage);
      updateHighlight();

      setStatus(`Switched to ${currentLanguage.label}`);
    });
  });

  btnParse.addEventListener("click", () => {
    try {
      const program = currentLanguage.parse(sourceEl.value);
      rules = program.rules;
      currentTerm = program.input;
      stepCount = 0;
      justStepped = false;

      renderCurrent();
      setStepControls(true);
      setStatus(`Parsed — ${rules.length} rule(s). Step count: 0`, "success");
    } catch (e) {
      treeContainer.innerHTML = "";
      setStepControls(false);
      if (e instanceof ParseError) {
        setStatus(`${e.message}`, "error");
      } else {
        setStatus(`Error: ${(e as Error).message}`, "error");
      }
    }
  });

  btnMatch.addEventListener("click", () => {
    if (!currentTerm || animating) return;

    const result = step(rules, currentTerm);
    if (result) {
      highlightMatch(currentTerm, result.rule, treeContainer);
      setStatus(`Rule ${result.ruleIndex + 1} matches`, "success");
    } else {
      justStepped = false;
      renderCurrent();
      setStatus(`Normal form — no rule matches`, "success");
      btnMatch.disabled = true;
      btnStep.disabled = true;
      btnRun.disabled = true;
    }
  });

  btnStep.addEventListener("click", async () => {
    if (!currentTerm || animating) return;

    const result = step(rules, currentTerm);
    if (result) {
      animating = true;
      setStepControls(false);

      const oldTerm = currentTerm;
      currentTerm = result.term;
      stepCount++;

      await animateStep(oldTerm, result.term, result.rule, result.substitution, treeContainer);

      animating = false;
      justStepped = true;
      setStepControls(true);
      setStatus(`Step ${stepCount}: rule ${result.ruleIndex + 1} matched`, "success");
    } else {
      justStepped = false;
      renderCurrent();
      setStatus(`Normal form reached after ${stepCount} step(s)`, "success");
      btnStep.disabled = true;
      btnRun.disabled = true;
    }
  });

  btnRun.addEventListener("click", () => {
    if (!currentTerm) return;

    const maxSteps = 1000;
    let steps = 0;
    let term = currentTerm;

    while (steps < maxSteps) {
      const result = step(rules, term);
      if (!result) break;
      term = result.term;
      steps++;
    }

    currentTerm = term;
    stepCount += steps;
    justStepped = steps > 0;
    renderCurrent();

    if (steps >= maxSteps) {
      setStatus(`Stopped after ${maxSteps} steps (limit reached). Total: ${stepCount}`, "error");
    } else {
      setStatus(`Normal form reached after ${stepCount} step(s)`, "success");
      btnStep.disabled = true;
      btnRun.disabled = true;
    }
  });

}
