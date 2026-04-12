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

  let currentLanguage: Language = LANGUAGES[0];

  function updateHighlight() {
    highlightCode.innerHTML = currentLanguage.highlight(sourceEl.value);
  }

  // Initialize editor with the default language's default program
  sourceEl.value = currentLanguage.defaultProgram;
  updateHighlight();

  sourceEl.addEventListener("input", updateHighlight);

  // Sync scroll between textarea and highlight layer
  const highlightLayer = document.getElementById("highlight-layer")!;
  sourceEl.addEventListener("scroll", () => {
    highlightLayer.scrollTop = sourceEl.scrollTop;
    highlightLayer.scrollLeft = sourceEl.scrollLeft;
  });

  sourceEl.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = sourceEl.selectionStart;
      const end = sourceEl.selectionEnd;
      sourceEl.value = sourceEl.value.substring(0, start) + "    " + sourceEl.value.substring(end);
      sourceEl.selectionStart = sourceEl.selectionEnd = start + 4;
      updateHighlight();
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

      // Reset interpreter state
      rules = [];
      currentTerm = null;
      stepCount = 0;
      justStepped = false;
      animating = false;

      treeContainer.innerHTML = "";
      setStepControls(false);

      sourceEl.value = currentLanguage.defaultProgram;
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
