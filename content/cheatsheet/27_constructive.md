---
title: Constructive & Implementation
order: 27
category: constructive
---
# Constructive & Implementation

Codeforces Div 2 A–C problems are mostly constructive/implementation: no named algorithm, just an observation.

## Recognize it

- "Construct any array/permutation/string/graph such that…", "print −1 if impossible".
- "Find the minimum number of operations" where operations have a simple structure.
- Simulation with careful details (implementation).
- **Interactive** problems: ask queries, find a hidden value within a query limit.

## Approach

1. **Solve tiny cases by hand** (n = 1, 2, 3, 4) and write the answers down. The pattern is usually visible.
2. **Find an invariant**: parity of the sum, sum modulo k, number of inversions mod 2, sortedness, gcd. If the invariant differs between the start and the target, print −1.
3. **Find a bound**: prove the answer is ≥ X (each operation fixes at most one thing), then construct exactly X.
4. **Think extremes**: put the largest/smallest element first, alternate high/low, use 1 and n as special anchors.
5. **Write a brute-force checker** for small n to confirm your construction before submitting.

## Common construction patterns

- **Permutations**: identity, reverse, rotate by one (`2 3 … n 1` has no fixed points), alternate `1 n 2 n−1 …`, split odds and evens (Beautiful Permutation: `2 4 6 … 1 3 5 …` for n ≥ 4).
- **Strings**: repeat a pattern (`abcabc…`), alternate two characters, put all of one letter first.
- **Pairing / matching**: sort and pair i with i + n/2.
- **Graphs/trees**: star (one center) or path (chain) usually achieve the extremes.
- **Grids**: checkerboard coloring, snake order, fill row by row with a shift.
- **Binary representation**: build numbers from powers of two; any n is a sum of distinct powers of two.
- **Greedy from one end**: fix position 1, then 2, … each with one operation.
- **Mex**: to get mex = k, include 0…k−1 and exclude k.

## Implementation habits

- Write helper functions (`inBounds`, `rotate`, `apply(op)`) instead of repeating index logic.
- Simulate the exact statement first; optimize only if it's too slow.
- Re-read the output format: spaces vs new lines, YES/yes, 0- or 1-indexed output.
- Multi-test problems: reset state and avoid O(max n) allocation per test.

## Interactive problems

```java
// Always flush after each query; read the response before the next query
System.out.println("? " + x);
System.out.flush();
int resp = in.nextInt();
if (resp == -1) System.exit(0);       // judge says you made an error / exceeded queries
```

- Binary search on the answer with queries (log₂ 10⁹ ≈ 30 queries).
- Ask about halves / bits to identify a hidden element.
- Count your queries against the limit before coding.
- Test locally by writing your own fake judge.

## Pitfalls

- Missing the "impossible" case (n = 2, n = 3 often special).
- Off-by-one when converting to 1-indexed output.
- Constructing something valid but forgetting the "minimum" requirement.

## Classic problems

- Codeforces: filter by tags `constructive algorithms` or `implementation` around your rating. These are the most common Div 2 A/B tags.
- CSES: Permutations, Two Sets, Gray Code, Mex Grid Construction, Grid Coloring I, Beautiful Permutation II, Construction Problems section.
