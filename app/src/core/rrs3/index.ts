import type { Language } from "../language";
import { parseProgram } from "./parser";
import { highlight } from "./highlight";

const defaultProgram = `signature:
    const Zero
    type Succ:
        Nat
    alias Nat: Succ | Zero

    const Nil
    type Cons<'t>:
        head: 't
        tail: List<'t>
    alias List<'t>: Cons<'t> | Nil

    type Reverse:
        List<Nat>
    type ReverseAcc:
        todo: List<Nat>
        done: List<Nat>

rules:
    Reverse(xs) -> ReverseAcc(xs, Nil)
    ReverseAcc(Cons(h, t), done) -> ReverseAcc(t, Cons(h, done))

input:
    Reverse(Cons(Succ(Zero), Cons(Succ(Succ(Zero)), Cons(Zero, Nil))))`;

export const rrs3: Language = {
  id: "rrs3",
  label: "RRS3",
  parse: parseProgram,
  highlight,
  defaultProgram,
};
