import { parse, ParseError } from "../core/parser";
import { step } from "../core/interpreter";
import { renderTree } from "./tree-render";
import type { Term, Rule } from "../core/types";

export function initApp(): void {
  const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
  const treeContainer = document.getElementById("tree-container")!;
  const statusBar = document.getElementById("status-bar")!;
  const btnParse = document.getElementById("btn-parse") as HTMLButtonElement;
  const btnStep = document.getElementById("btn-step") as HTMLButtonElement;
  const btnRun = document.getElementById("btn-run") as HTMLButtonElement;
  const btnReset = document.getElementById("btn-reset") as HTMLButtonElement;

  // Resize handle logic
  const editorPane = document.getElementById("editor-pane")!;
  const resizeHandle = document.getElementById("resize-handle")!;

  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    resizeHandle.classList.add("dragging");
    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(e.clientX, window.innerWidth - 200));
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

  let rules: Rule[] = [];
  let currentTerm: Term | null = null;
  let inputTerm: Term | null = null;
  let stepCount = 0;
  let justStepped = false;

  function setStatus(msg: string, kind: "" | "error" | "success" = "") {
    statusBar.textContent = msg;
    statusBar.className = kind;
  }

  function setStepControls(enabled: boolean) {
    btnStep.disabled = !enabled;
    btnRun.disabled = !enabled;
    btnReset.disabled = !enabled;
  }

  function renderCurrent() {
    if (currentTerm) {
      renderTree(currentTerm, treeContainer, justStepped);
    }
  }

  btnParse.addEventListener("click", () => {
    try {
      const program = parse(sourceEl.value);
      rules = program.rules;
      inputTerm = program.input;
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

  btnStep.addEventListener("click", () => {
    if (!currentTerm) return;

    const result = step(rules, currentTerm);
    if (result) {
      currentTerm = result.term;
      stepCount++;
      justStepped = true;
      renderCurrent();
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

  btnReset.addEventListener("click", () => {
    if (!inputTerm) return;

    currentTerm = inputTerm;
    stepCount = 0;
    justStepped = false;
    renderCurrent();
    setStepControls(true);
    setStatus(`Reset — Step count: 0`, "success");
  });
}
