import { ParseError } from "./rrs/language";
import { rrs3 } from "./rrs/rrs3";
import { step } from "./rrs/interpreter";
import type { Rule, Term, Substitution } from "./rrs/types";

export type SessionStatus =
  | { kind: "idle" }
  | { kind: "ready"; ruleCount: number; stepCount: number }
  | { kind: "matched"; ruleIndex: number }
  | { kind: "stepped"; ruleIndex: number; stepCount: number }
  | { kind: "normal-form"; stepCount: number }
  | { kind: "limit-reached"; stepCount: number; limit: number }
  | { kind: "error"; message: string };

export interface StepEvent {
  oldTerm: Term;
  newTerm: Term;
  rule: Rule;
  substitution: Substitution;
}

type Listeners = {
  change: ((term: Term | null) => void)[];
  status: ((status: SessionStatus) => void)[];
  matchPreview: ((rule: Rule) => void)[];
  step: ((ev: StepEvent) => Promise<void> | void)[];
};

export class RrsSession {
  private rules: Rule[] = [];
  private currentTerm: Term | null = null;
  private history: Term[] = [];
  private stepCount = 0;
  private animating = false;
  private listeners: Listeners = { change: [], status: [], matchPreview: [], step: [] };
  private _status: SessionStatus = { kind: "idle" };

  get term(): Term | null { return this.currentTerm; }
  get status(): SessionStatus { return this._status; }
  get canStep(): boolean { return this.currentTerm !== null && !this.animating; }
  get canUndo(): boolean { return this.history.length > 0 && !this.animating; }
  get isAnimating(): boolean { return this.animating; }

  on<K extends keyof Listeners>(ev: K, cb: Listeners[K][number]): void {
    (this.listeners[ev] as any[]).push(cb);
  }

  private emit<K extends keyof Listeners>(ev: K, ...args: any[]): Promise<void> {
    const cbs = this.listeners[ev] as any[];
    const results = cbs.map((cb) => cb(...args));
    return Promise.all(results).then(() => {});
  }

  private setStatus(s: SessionStatus): void {
    this._status = s;
    void this.emit("status", s);
  }

  parse(source: string): boolean {
    try {
      const program = rrs3.parse(source);
      this.rules = program.rules;
      this.currentTerm = program.input;
      this.history = [];
      this.stepCount = 0;
      void this.emit("change", this.currentTerm);
      this.setStatus({ kind: "ready", ruleCount: this.rules.length, stepCount: 0 });
      return true;
    } catch (e) {
      this.rules = [];
      this.currentTerm = null;
      this.history = [];
      this.stepCount = 0;
      void this.emit("change", null);
      const msg = e instanceof ParseError ? e.message : (e as Error).message;
      this.setStatus({ kind: "error", message: msg });
      return false;
    }
  }

  match(): void {
    if (!this.currentTerm || this.animating) return;
    const result = step(this.rules, this.currentTerm);
    if (result) {
      void this.emit("matchPreview", result.rule);
      this.setStatus({ kind: "matched", ruleIndex: result.ruleIndex });
    } else {
      this.setStatus({ kind: "normal-form", stepCount: this.stepCount });
    }
  }

  async step(): Promise<void> {
    if (!this.currentTerm || this.animating) return;
    const result = step(this.rules, this.currentTerm);
    if (!result) {
      this.setStatus({ kind: "normal-form", stepCount: this.stepCount });
      return;
    }
    this.animating = true;
    const oldTerm = this.currentTerm;
    this.history.push(oldTerm);
    this.currentTerm = result.term;
    this.stepCount++;
    await this.emit("step", {
      oldTerm,
      newTerm: result.term,
      rule: result.rule,
      substitution: result.substitution,
    });
    this.animating = false;
    void this.emit("change", this.currentTerm);
    this.setStatus({ kind: "stepped", ruleIndex: result.ruleIndex, stepCount: this.stepCount });
  }

  undo(): void {
    if (this.animating || this.history.length === 0) return;
    this.currentTerm = this.history.pop()!;
    this.stepCount--;
    void this.emit("change", this.currentTerm);
    this.setStatus({ kind: "ready", ruleCount: this.rules.length, stepCount: this.stepCount });
  }

  run(maxSteps = 1000): void {
    if (!this.currentTerm || this.animating) return;
    let steps = 0;
    let term = this.currentTerm;
    while (steps < maxSteps) {
      const r = step(this.rules, term);
      if (!r) break;
      this.history.push(term);
      term = r.term;
      steps++;
    }
    this.currentTerm = term;
    this.stepCount += steps;
    void this.emit("change", this.currentTerm);
    if (steps >= maxSteps) {
      this.setStatus({ kind: "limit-reached", stepCount: this.stepCount, limit: maxSteps });
    } else {
      this.setStatus({ kind: "normal-form", stepCount: this.stepCount });
    }
  }
}
