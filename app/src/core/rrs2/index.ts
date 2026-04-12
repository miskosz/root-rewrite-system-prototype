import type { Language } from "../language";
import { parseProgram } from "./parser";
import { highlight } from "./highlight";

const defaultProgram = `signature:
    const Zero
    type Succ:
        Nat
    alias Nat: Succ | Zero

    type SumInput:
        Nat
        Nat
    type SumOutput:
        Nat

rules:
    SumInput(Succ(ltail), right) -> SumInput(ltail, Succ(right))
    SumInput(Zero, right) -> SumOutput(right)

input:
    SumInput(Succ(Succ(Succ(Zero))), Succ(Succ(Zero)))`;

export const rrs2: Language = {
  id: "rrs2",
  label: "RRS2",
  parse: parseProgram,
  highlight,
  defaultProgram,
};
