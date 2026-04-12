import type { Language } from "../language";
import { parseProgram } from "./parser";
import { highlight } from "./highlight";

const defaultProgram = `signature:
    const Zero
    type Succ:
        Succ | Zero

    type SumInput:
        Succ | Zero
        Succ | Zero
    type SumOutput:
        Succ | Zero

rules:
    SumInput(Succ(ltail), right) -> SumInput(ltail, Succ(right))
    SumInput(Zero, right) -> SumOutput(right)
input:
    SumInput(Succ(Succ(Succ(Zero))), Succ(Succ(Zero)))`;

export const rrs1: Language = {
  id: "rrs1",
  label: "RRS1",
  parse: parseProgram,
  highlight,
  defaultProgram,
};
