import type { Language } from "../language";
import { parseProgram } from "./parser";
import { highlight } from "./highlight";

const defaultProgram = `type Nat:
    Zero
    Succ(Nat)

type List<'t>:
    Nil
    L(head: 't, tail: List<'t>)

type Reverse(List<Nat>)
type ReverseAcc(todo: List<Nat>, done: List<Nat>)

rule Reverse(xs) -> ReverseAcc(xs, Nil)
rule ReverseAcc(h :: t, done) -> ReverseAcc(t, h :: done)

input: Reverse(Succ(Zero) :: Succ(Succ(Zero)) :: Zero :: Nil)`;

export const rrs3: Language = {
  id: "rrs3",
  label: "RRS3",
  parse: parseProgram,
  highlight,
  defaultProgram,
};
