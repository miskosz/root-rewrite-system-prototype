# Rooted Tree Machines

Rooted Tree Machine (RTM) is a computation model operating on *terms*.

---

**Definition.** Let *type definition* be a tuple `TypeDef = (TypeIdents, arity, typedef)`
where:

- `TypeIdents` is a finite set
- `arity: TypeIdents -> \N` is a function
- `typedef: T \mapsto \powerset(TypeIdents)^arity(T)` for `T \in TypeIdents`

---

**Definition.** Let `TypeDef` be a given type definition and `T \in Typedef.TypeIdents`.
Recursively define `Terms(T)` *terms of type `T`* such that:

- Denote `TypeDef.arity(T) = k` and `TypeDef.typedef(T) = (U_1, ..., U_k)`.
  If `t_i \in Terms(T'_i)` for some `T'_i \in U_i`, then `T(t_1, ..., t_k) \in Terms(T)`.

Let `Terms(TypeDef)` be a union of terms for all types in `TypeDef.TypeIdents`.

---

Example. Let `Nat := ({Cons, Zero}, arity, typedef)` with:

- `arity(Zero) = 0`, `typedef(Zero) = ()`
- `arity(Cons) = 1`, `typedef(Cons) = ({Cons, Zero})`

Then elements of `Terms(Nat)` are:

- `Zero`
- `Cons(Zero)`
- `Cons(Cons(Zero))`
- etc.

---

A more convenient notation for type definition:

```
typedef:
    const Zero
    type Cons
        Cons | Zero
```

Optionally we may want to name the components:

```
typedef:
    const Zero
    type Cons
        tail: Cons | Zero
```

---

**Definition.** Let `Variables` be a countable set of variables, wlog disjoint with anything else.
Let `TypeDef` be a type definition. For `T \in TypeDef.TypeIdents` define `TermsVar(T)`
*terms with variables of type `T`* such that:

- `Variables \subset TermsVar(T)`
- Denote `TypeDef.arity(T) = k` and `TypeDef.typedef(T) = (T_1, ..., T_k)`.
  If `t_i \in TermsVar(T'_i)` for some `T'_i \in U_i`, then `T(t_1, ..., t_k) \in TermsVar(T)`.

Let `TermsVar(TypeDef)` be a union of terms with variables for all types in `TypeDef.TypeIdents`.

---

**Definition.** Let `TypeDef` be a type definition. A *rewrite rule* is a tuple
`rule = (t_left, t_right) \in TermsVar(Typedef)^2` such that:

- Every variable in `t_left` occurs at most once
- Every variable in `t_right` occurs at most once
- Every variable in `t_right` occurs in `t_left`

---

**Definition.** Let `t \in Terms(TypeDef)` be a term and `rule = (t_left, t_right)` a rewriting
rule. Then *`rule` can be applied at `t`* if the term "matches at the root" (won't define formally).
We also define *`t` rewritten by `rule`* naturally.

---

Example. Let `BinTree` be a type definition:

```
typedef:
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
        Leaf
    )
),
t1_left = BinNode(
    Leaf
    x,
),
t1_right = x

t2_left = BinNode(
    x,
    Leaf
),
t2_right = x
```

Then `rule1` can be applied at `t` resulting in `t' = BinNode(Leaf, Leaf)`. However, `rule2`
cannot be applied because `t2_left` does not match `t`. The root type `BinNode` matches, however
the second coordinates do not match - `t.2` is not `Leaf`.

---

**Definition.** *Rooted Tree Machine* is a tuple `RTM = (TypeDef, Rules)` where `TypeDef` is a type
definition and `Rules` is an ordered list of rules.

- The machine is provided a term `input = t_0 \in Terms(TypeDef)` on the input.
- In one *step* the machine rewrites the term `t_i -> t_{i+1}` with the first rule in the list
  that can be applied.
- The machine halts if no rule can be applied, outputting the last term.
