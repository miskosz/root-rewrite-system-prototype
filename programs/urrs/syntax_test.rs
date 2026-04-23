# MatchChildren(h1 :: tail1, h2 :: tail2) =
# | out = Match(h1, h2)
# | if let MatchOutFalse(h1, h2) = out:
# |     return MatchChildrenOutFalse(h1 :: tail1, h2 :: tail2)
# | MatchOutTrue(head_binds, h1, h2) = out
# | out2 = MatchChildren(tail1, tail2)
# | if let MatchChildrenOutFalse(tail1, tail2) = out:
# |     h1 = Substitute(head_binds, h1)
# |     return MatchChildrenOutFalse(h1 :: tail1, h2 :: tail2)
# | MatchChildrenOutTrue(tail_binds, tail1, tail2) = out2
# | binds = ListMerge(head_binds, tail_binds)
# | return MatchChildrenOutTrue(binds, h1 :: tail1, h2 :: tail2)

const A
const B
const C

enum SumType {
    A,
    B,
    C(A, B),
}

struct ProdType {
    a: A | B,
    b: B,
    c: SumType,
}

ProdType = (
    A | B,
    B,
    A | B | C(A | B)
)

// Keby sumtype mal constructor
ProdType(
    AorB(A | B),
    JustB(B),
    Comb(A | B | C(A | B)),
    D(A, B),  // <- prod has prod? To je ok.
)

data List<'a> =
    | Nil
    | Cons('a, List)

data List<'a>:
    Nil
    Cons('a, List)


rule MatchChildren(h1 :: tail1, h2 :: tail2):
    match Match(h1, h2):
        case MatchOutFalse(h1, h2):
            return MatchChildrenOutFalse(h1 :: tail1, h2 :: tail2)
        case MatchOutTrue(head_binds, h2):
            match MatchChildren(tail1, tail2):
                case MatchChildrenOutFalse(tail1, tail2):
                    h1, h2 = CopyTerm(h2)
                    h1 = Substitute(head_binds, h1)
                    return MatchChildrenOutFalse(h1 :: tail1, h2 :: tail2)

////////////////////

type Unit

type Nat:
    Zero
    Succ(Nat)

type List<'a>:
    Nil
    Cons('a, List)

type Term:
    Var(Nat)
    Node(Nat, Term)

type Bind:
    Bind(Var, Term)
type Bind(Var, Term)
type Bind(var: Var, term: Term)

type Rule(lhs: Term, rhs: Term)

type RunRRS(
    rules_: List<Rule>,
    input_: Term
)

////////////////////

type Unit

type Nat {
    Zero,
    Succ(Nat),
}

type List<'a> {
    Nil,
    Cons('a, List).
}

type Term {
    Var(Nat),
    Node(Nat, Term),
}

type Bind (
    Var,
    Term,
)
type Rule(lhs: Term, rhs: Term)

type RunRRS(
    rules_: List<Rule>,
    input_: Term
)

////////////////////

const Unit

sumtype Nat:
    Zero
    Succ(Nat)

sumtype List<'a>:
    Nil
    Cons('a, List)

sumtype Term:
    Var(Nat)
    Node(Nat, Term)

prodtype Bind:
    Var
    Term

prodtype Rule:
    lhs: Term
    rhs: Term

prodtype RunRRS:
    rules_: List<Rule>
    input_: Term


////////////////////

type Unit

type Nat:
    | Zero
    | Succ(Nat)

type List<'a>:
    | Nil
    | Cons('a, List)

type Term:
    | Var(Nat)
    | Node(Nat, Term)

type Bind:
    - Var
    - Term

type Rule:
    - lhs: Term
    - rhs: Term

type RunRRS:
    - rules_: List<Rule>
    - input_: Term


////////////////////

type Unit

type List<'a>:
    + Nil
    + Cons('a, List)

type RunRRS:
    * rules_: List<Rule>
    * input_: Term


////////////////////

type Unit

type List<'a>:
    | Nil
    | Cons('a, List)

type RunRRS:
    & rules_: List<Rule>
    & input_: Term

////////////////////

type Unit

type Nat:
    | Zero
    | Succ(Nat)

type List<'a>:
    | Nil
    | Cons('a, List)

type Term:
    | Var(Nat)
    | Node(Nat, Term)

type Sum(Nat, Nat)
type SumOut(Nat)

match Sum:
| Sum(Succ(x), y) -> Sum(x, Succ(y))
| Sum(Zero, y) -> SumOut(y)

rule Sum(Succ(x), y) -> Sum(x, Succ(y))
rule Sum(Zero, y) -> SumOut(y

type Eq<'a>('a, 'a)
type ListEq<'a>(List<'a>, List<'a>)
type Bool:
    | False
    | True


rule ListEq:
| ListEq(Nil, Nil) -> True
| ListEq(h1 :: t1, h2 :: t2) -> match Eq(h1, h2):
    | False -> False
    | True -> return ListEq(t1, t2)
| ListEq(_, _) -> False

rule Runtime(ListEq(l1, l2) :: cstack, vstack) -> match l1, l2 move cstack, vstack:
| Nil, Nil -> Runtime(cstack, True :: vstack)
| h1 :: t1, h2 :: t2 -> Runtime(Eq(h1, h2) :: ListEq2 :: cstack, vstack)
| _, _ -> Runtime(cstack, False :: vstack)

rule Runtime(ListEq2 :: cstack, ret :: vstack) -> match ret move cstack, vstack:
| False -> Runtime(cstack, False :: vstack)
| True -> Runtime(ListEq(t1, t2) :: cstack, vstack)


////////////////////

type Unit

type Nat:
    | Zero
    | Succ Nat

type List<'a>:
    | Nil
    | Cons 'a List

type Term:
    | Var Nat
    | Node Nat Term

type Sum Nat Nat
type SumOut Nat

match Sum:
| Sum (Succ x) y -> Sum x (Succ y)
| Sum Zero y -> SumOut y

rule Sum Succ(x) y -> Sum x Succ(y)
rule Sum Zero y -> SumOut y

type Eq<'a> 'a 'a
type ListEq<'a> List<'a> List<'a>
type Bool:
    | False
    | True


rule ListEq:
| ListEq Nil Nil -> True
| ListEq (h1 :: t1) (h2 :: t2) -> match Eq h1 h2:
    | False -> False
    | True -> return ListEq t1 t2
| ListEq _ _ -> False

rule Runtime ((ListEq l1 l2) :: cstack) vstack -> match l1, l2 move cstack, vstack:
| Nil, Nil -> Runtime cstack (True :: vstack)
| h1 :: t1, h2 :: t2 -> Runtime (Eq(h1, h2) :: ListEq2 :: cstack) vstack
| _, _ -> Runtime cstack (False :: vstack)

rule Runtime (ListEq2 :: cstack) (ret :: vstack) -> match ret move cstack, vstack:
| False -> Runtime cstack (False :: vstack)
| True -> Runtime (ListEq(t1, t2) :: cstack) vstack


////////////////////
////////////////////

type Term:
| Var Nat
| Node Nat List<Term>

type CopyTerm Term
type CopyTermOut Term Term

fn CopyTerm t -> match t:
| Var id -> match CopyNat id:
    | CopyNatOut id1 id2 -> CopyTermOut (Var id1) (Var id2)
| Node id ch -> match CopyNat id:
    | CopyNatOut id1 id2 -> match CopyTerms ch:
        | CopyTermsOut ch1 ch1 -> CopyTermOut (Node id1 ch1) (Node id2 ch2)

// alt
fn CopyTerm t -> match t:
| Var id -> match CopyNat id:
    | CopyNatOut id1 id2 -> CopyTermOut (Var id1) (Var id2)
| Node id ch -> match (CopyNat id) (CopyTerms ch):
    | (CopyNatOut id1 id2) (CopyTermsOut ch1 ch1) -> CopyTermOut (Node id1 ch1) (Node id2 ch2)

fn CopyTerms t -> match t:
| Nil -> CopyTermsOut Nil Nil
| h :: t -> match (CopyTerm h) (CopyTerms t)
    | (CopyTermOut h1 h2) (CopyTermsOut t1 t2) -> CopyTermsOut (h1 :: t1) (h2 :: t2)

// succinct
fn CopyTerm t -> match t:
| Var id -> match CopyNat id:
    | id1 id2 -> (Var id1) (Var id2)
| Node id ch -> match (CopyNat id) (CopyTerms ch):
    | (id1 id2) (ch1 ch1) -> (Node id1 ch1) (Node id2 ch2)

fn CopyTerms t -> match t:
| Nil -> Nil Nil
| h :: t -> match (CopyTerm h) (CopyTerms t)
    | (h1 h2) (t1 t2) -> (h1 :: t1) (h2 :: t2)


////////////////////

type Term:
    Var Nat
    Node Nat List<Term>

type CopyTerm Term
type CopyTermOut Term Term

fn CopyTerm t -> match t:
    Var id -> match CopyNat id:
        CopyNatOut id1 id2 -> CopyTermOut (Var id1) (Var id2)
    Node id ch -> match CopyNat id:
        CopyNatOut id1 id2 -> match CopyTerms ch:
            CopyTermsOut ch1 ch1 -> CopyTermOut (Node id1 ch1) (Node id2 ch2)

////////////////////

type Term:
    Var(Nat)
    Node(Nat, List<Term>)

type CopyTerm(Term)
type CopyTermOut(Term, Term)

fn CopyTerm(t) -> match t:
    Var(id) -> match CopyNat(id):
        CopyNatOut(id1, id2) -> CopyTermOut(Var(id1), Var(id2))
    Node(id, ch) -> match CopyNat(id):
        CopyNatOut(id1, id2) -> match CopyTerms(ch):
            CopyTermsOut(ch1, ch1) -> CopyTermOut(Node(id1, ch1), Node(id2, ch2))

fn CopyTerm(t) -> match t {
    Var(id) -> match CopyNat(id) {
        CopyNatOut(id1, id2) -> CopyTermOut(Var(id1), Var(id2))
    },
    Node(id, ch) -> match CopyNat(id) {
        CopyNatOut(id1, id2) -> match CopyTerms(ch) {
            CopyTermsOut(ch1, ch1) -> CopyTermOut(Node(id1, ch1), Node(id2, ch2))
        }
    },
}

fn Runtime (CopyTerm(t) :: cstack) vstack -> match t {
    Var(id) -> Runtime ((CopyNat id) :: CopyTerm2 :: cstack) vstack
    Node(id, ch) -> Runtime ((CopyNat id) :: (CopyTerms ch) :: CopyTerm3 :: cstack) vstack
}
fn Runtime (CopyTerm2 :: cstack) ((CopyNatOut id1 id2) :: vstack) -> CopyTermOut (Var id1) (Var id2)
fn Runtime (CopyTerm3 :: cstack) ((CopyNatOut id1 id2) :: (CopyTermsOut ch1 ch2) :: vstack) -> ...
