RRS - Root Rewrite System - is a custom computation model I am experimenting with. For intuition, it is a many-sorted linear term rewrite system that is applied only at root. It is also a simple functional programming language operating on algebraic data types with match rewrite rules.

Formally, RRS operates on **terms**. Allowed terms are defined by a signature - a set of constructors with a non-negative integer arity. Furthermore, we restrict the set of allowed terms with **types**:

```
# Nullary type `Konst` with a single constructor `Konst` ("a constant")
type Konst
type A
type B

# Product type `Prod` with a single constructor `Prod`
type Prod(A, B)

# Sum type `Sum` with constructors `Left` and `Right`
type Sum {Left(A), Right(B)}
```

A **rule** is a tuple `(lhs, rhs)` of (typed) terms with (typed) variables, such that 1) every variable occurs exactly once in `lhs` and in `rhs`; and 2) every variable in `rhs` occurs in lhs.

A **RRS** is defined by a list of rules. Input is a term, and output is a term. A single step applies the first rule where `lhs` matches the current term. If no rule can be applied, we reached a normal form, which is the output.

---

I am experimenting with high level syntax for RRS. Consider this program in a low-level syntax:

```
type Nat {Zero, Succ(Nat)}
type Sum(Nat, Nat)
type StackType {Nat, Sum}
type Stack {Empty, Cons(StackType, Stack)}

rule Stack(Cons(Sum(a, Zero), Empty)) -> Stack(Cons(a, Empty))
rule Stack(Cons(Sum(a, Succ(b)), Empty)) -> Stack(Cons(Sum(a, Succ(b)), Empty))
```

In a version of a high-level syntax it could be written as:

```
# Runtime (stack) is defined by default

type Nat {Zero, Succ(Nat)}

fn Sum(Nat, Nat) -> Nat match {
    (a, Zero) => a,
    (a, Succ(b)) => Sum(Succ(a), b),
}
```

---

Below, you can see a universal RRS that can simulate other RRSs with at most 8 constructors and 8 variables. Do not review the implementation, just review the syntax from a language design viewpoint.

Review the proposed syntax. Be critical. What improvements can be made?

```
# Syntax prototype 3 for RRS4

###
### begin system
###

type List<'t> {
    Nil,
    L(head: 't, tail: List<'t>),
}

open type RuntimeStackType
type Runtime(stack: List<RuntimeStackType>)

###
### end system
###

type Z8 {I0, I1, I2, I3, I4, I5, I6, I7}

type Term {
    Var(id: Z8),
    Node(id: Z8, children: List<Term>),
}

type Bind(var: Var, term: Term)

type Rule(lhs: Term, rhs: Term)

# ---

### ListMerge ###

fn ListMerge<'a>(List<'a>, List<'a>) -> List<'a> match {
    (Nil, l2) => l2,
    (h1 :: t1, l2) => return ListMerge(t1, h1 :: l2),
}

### CopyTerm ###

fn CopyTerm<'id: Z8>(Term) -> .(Term, Term) match {
    Var('id) => .(Var('id), Var('id)),
    Node('id, ch) =>
        CopyTerms(ch) as (ch1, ch1);
        .(Node('id, ch1), Node('id, ch2)),
}

### CopyTerms ###

fn CopyTerms(List<Term>) -> .(List<Term>, List<Term>) match {
    Nil => .(Nil, Nil),
    h :: t =>
        CopyTerm(h) as (h1, h2);
        CopyTerms(t) as (t1, t2);
        .(h1 :: t1, h2 :: t2),
}

# ---------------------
# ---------------------

### FindBind ###

fn FindBind<'id: Z8>(var: Var, binds: List<Bind>) -> .{
    .NoMatch(var: Var, binds: List<Bind>),
    .Match(var: Var, binds: List<Bind>, term: Term),
} match {
    (var, Nil) => .NoMatch(var, Nil),
    (Var('id), Bind(Var('id), term) :: t) => .Match(Var('id), t, term),
    (var, h :: t) => FindBind(var, t) match {
        .NoMatch(var, t) => .NoMatch(var, h :: t),
        .Match(var, t, m) => .Match(var, h :: t, m),
    },
}

### Substitute ###

fn Substitute(term: Term, binds: List<Bind>) -> .(term: Term, unused_binds: List<Bind>) {
    Var(id) => FindBind(Var(id), binds) match {
        .NoMatch(var, binds) => .(var, binds),
        .Match(var, binds, term) => .(term, binds),
    },
    Node(id, ch) => 
        SubstituteMany(ch, binds) as (ch, binds);
        .(Node(id, ch), binds),
}

fn SubstituteMany(terms: List<Term>, binds: List<Bind>) -> .(
    terms: List<Term>, unused_binds: List<Bind>
) match {
    Nil => .(Nil, binds)
    h :: t =>
        Substitute(h, binds) as (h, binds);
        SubstistuteMany(t, binds) as (t, binds);
        .(h :: t, binds)
}

# ---------------------
# ---------------------

### Match ###

fn MatchTerm<'id: Z8>(varterm: Term, term: Term) -> {
    .False(varterm: Term, term: Term),
    .True(varterm: Term, binds: List<Bind>),
} match {
    (Var('id), term) => .True(Var('id), Bind(Var('id), term) :: Nil),
    (Node('id, ch1), Node('id, ch2)) => MatchTerms(ch1, ch2) match {
        .False(ch1, ch2) => .False(Node('id, ch1), Node('id, ch2)),
        .True(ch1, binds) => .True(Node('id, ch1), binds),
    },
    varterm, term => .False(varterm, term),
}

### MatchTerms ###

fn MatchTerms(ch1: List<Term>, ch2: List<Term>) -> {
    .False(ch1: List<Term>, ch2: List<Term>),
    .True(binds: List<Bind>, ch2: List<Term>),
} match {
    (Nil, Nil) => .True(Nil, Nil),
    (h1 :: t1, h2 :: t2) => MatchTerm(h1, h2) match {
        .False(h1, h2) => .False(h1 :: t1, h2 :: t2),
        .True(h1, head_binds) => MatchTerms(t1, t2) match {
            .False(t1, t2) =>
                CopyTerm(h1) as (h1, h2);
                Substitute(h2, head_binds) as (h2, _);
                .False(h1 :: t1, h2 :: t2),
            .True(t1, tail_binds) =>
                ListMerge(head_binds, tail_binds) as binds;
                .True(h1 :: t1, binds),
        }
    },
    (ch1, ch2) => .False(ch1, ch2),
}

# ---------------------
# ---------------------

### ApplyFirstRule ###

fn ApplyFirstRule(rules: List<Rule>, term: Term) -> {
    .Match(rules: List<Rule>, newterm: Term),
    .NoMatch(rules: List<Rule>, term: Term),
} match {
    (Nil, term) => .NoMatch(Nil, term),
    (Rule(lhs, rhs) :: rtail, term) => MatchTerm(lhs, term) match {
        .True(lhs, binds) =>
            CopyTerm(rhs) as rhs, rhs_copy;
            Substitute(rhs_copy, binds) as newterm;
            .Match(Rule(lhs, rhs) :: rtail, newterm),
        .False(lhs, term) => ApplyFirstRule(rtail, term) match {
            .Match(rtail, newterm) => .Match(Rule(lhs, rhs) ::rtail, newterm),
            .NoMatch(rtail, term) => .NoMatch(Rule(lhs, rhs) ::rtail, term),
        },
    },
}

### RunRRS ###

fn RunRRS(List<Rule>, Term) -> Term as (rules, term);
    ApplyFirstRule(rules, term) match {
        .Match(rules, newterm) => return RunRRS(rules, newterm),
        .NoMatch(_, term) => term,
    }


input:

    # Runtime(
    #     Match(
    #         Node(
    #             I1,
    #             Node(I0, Nil) :: Node(I1, Nil) :: Nil
    #         ),
    #         Node(
    #             I1,
    #             Var(I2) :: Node(I0, Nil) :: Nil
    #         )
    #     ) :: Nil,
    #     Nil
    # )


    # Runtime(
    #     FindBind(
    #         Bind(Var(I2), Node(I0, Nil)) ::
    #         Bind(Var(I1), Node(I1, Nil)) ::
    #         Bind(Var(I0), Node(I2, Nil)) ::
    #         Nil,
    #         Var(I0)
    #     ) :: Nil,
    #     Nil
    # )

    # Runtime(
    #     Substitute(
    #         Bind(Var(I2), Node(I0, Nil)) ::
    #         Bind(Var(I1), Node(I1, Nil)) ::
    #         Bind(Var(I0), Node(I2, Nil)) ::
    #             Nil,
    #         Node(
    #             I0,
    #             Node(
    #                 I1,
    #                 Var(I2) :: Node(I0, Nil) :: Nil
    #             ) ::
    #             Var(I1) ::
    #                 Nil
    #         )
    #     ) :: Nil,
    #     Nil
    # )

    # URRS
    # Sum
    # I0 - Zero
    # I1 - Succ
    # I2 - Program
    Runtime(
        RunRRS(
            # rules
            # Program(Succ(x), y) = Program(x, Succ(y))
            Rule(
                Node(
                    I2,
                    Node(I1, Var(I0) :: Nil) :: Var(I1) :: Nil
                ),
                Node(
                    I2,
                    Var(I0) :: Node(I1, Var(I1) :: Nil) :: Nil
                )
            ) :: Nil,
    
            # term
            # Program(Succ(Succ(Zero)), Succ(Zero))
            Node(
                I2,
                Node(
                    I1,
                    Node(
                        I1, Node(I0, Nil) :: Nil
                    ) :: Nil
                ) ::
                Node(
                    I1, Node(I0, Nil) :: Nil
                ) ::
                Nil
            )
        ) :: Nil,
        Nil  # vstack
    )
```
