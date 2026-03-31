# Rooted Tree Machines

Rooted Tree Machine (RTM) is a computation model operating on *terms*. The definitions below
use ideas from term rewriting systems (TRS) and functional language features in e.g.
ML/Haskell/Rust.

---

**Definition.** Let *signature* be a tuple `Signature = (Types, arity, childTypes)`
where:

- `Types` is a finite set
- `arity: Types -> \N` is a function
- `childTypes: T \mapsto \powerset(Types)^arity(T)` for `T \in Types`

---

*Note.* A signature corresponds to a many-sorted constructor signature in TRS, or an algebraic data
type definition in functional languages.

---

**Definition.** Let `Signature` be a given signature and `T \in Signature.Types`.
Recursively define `Terms(T)` *terms of type `T`* such that:

- Denote `Signature.arity(T) = k` and `Signature.childTypes(T) = (U_1, ..., U_k)`.
  If `t_i \in Terms(T'_i)` for some `T'_i \in U_i`, then `T(t_1, ..., t_k) \in Terms(T)`.

Let `Terms(Signature)` be a union of terms for all types in `Signature.Types`.

---

Example. Let `Nat := ({Cons, Zero}, arity, childTypes)` with:

- `arity(Zero) = 0`, `childTypes(Zero) = ()`
- `arity(Cons) = 1`, `childTypes(Cons) = ({Cons, Zero})`

Then elements of `Terms(Nat)` are:

- `Zero`
- `Cons(Zero)`
- `Cons(Cons(Zero))`
- etc.

---

A more convenient notation for signature:

```
signature:
    const Zero
    type Cons
        Cons | Zero
```

Optionally we may want to name the components:

```
signature:
    const Zero
    type Cons
        tail: Cons | Zero
```

---

**Definition.** Let `Variables` be a countable set of variables, wlog disjoint with anything else.
Let `Signature` be a signature. For `T \in Signature.Types` define `TermsVar(T)`
*terms with variables of type `T`* such that:

- `Variables \subset TermsVar(T)`
- Denote `Signature.arity(T) = k` and `Signature.childTypes(T) = (U_1, ..., U_k)`.
  If `t_i \in TermsVar(T'_i)` for some `T'_i \in U_i`, then `T(t_1, ..., t_k) \in TermsVar(T)`.

Let `TermsVar(Signature)` be a union of terms with variables for all types in `Signature.Types`.

---

**Definition.** Let `Signature` be a signature. A *rewrite rule* is a tuple
`rule = (t_left, t_right) \in TermsVar(Signature)^2` such that:

- Every variable in `t_left` occurs at most once
- Every variable in `t_right` occurs at most once
- Every variable in `t_right` occurs in `t_left`

---

*Note.* As a TRS, these conditions make the system *linear* — each variable binds at most once per
side. Variables in `t_left` may be absent from `t_right` (*erasing* rules). Terms with variables
correspond to patterns in functional languages.

---

**Definition.** A *substitution* is a map `\sigma: Variables -> Terms(Signature)`. Applying `\sigma`
to a term with variables replaces each variable with its image.

---

**Definition.** Let `t \in Terms(Signature)` be a term and `rule = (t_left, t_right)` a rewrite
rule. Then *`rule` can be applied at `t`* if there exists a substitution `\sigma` such that
`\sigma(t_left) = t`. We define *`t` rewritten by `rule`* as `\sigma(t_right)`.

---

Example. Let `BinTree` be a signature:

```
signature:
    const Leaf
    type BinNode:
        BinNode | Leaf
        BinNode | Leaf
```

Let `t`, `rule1 = (t1_left, t1_right)` and `rule2 = (t2_left, t2_right)` be such that:
```
t = BinNode(
    Leaf,
    BinNode(
        Leaf,
        Leaf,
    ),
),
t1_left = BinNode(
    Leaf,
    x,
),
t1_right = x

t2_left = BinNode(
    x,
    Leaf,
),
t2_right = x
```

Then `rule1` can be applied at `t` resulting in `t' = BinNode(Leaf, Leaf)`. However, `rule2`
cannot be applied because `t2_left` does not match `t`. The root type `BinNode` matches, however
the second coordinates do not match - `t.2` is not `Leaf`.

---

**Definition.** *Rooted Tree Machine* is a tuple `RTM = (Signature, Rules)` where `Signature` is a
signature and `Rules` is an ordered list of rules.

- The machine is provided a term `input = t_0 \in Terms(Signature)` on the input.
- In one *step* the machine rewrites the term `t_i -> t_{i+1}` with the first rule in the list
  that can be applied.
- The machine halts if no rule can be applied, outputting the last term.

We admit the machine to run indefinitely if a rule is always applicable.

---

*Note.* In TRS terminology, an RTM is a *priority root-rewrite system*: rules apply only at the
root (not at arbitrary subterm positions as in standard TRS), and the first matching rule takes
priority — exactly the semantics of `match`/`case` syntax in functional languages.

---
