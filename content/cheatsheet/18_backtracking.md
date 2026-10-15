---
title: Backtracking & Recursion
order: 18
category: backtracking
---
# Backtracking & Recursion

## Recognize it

- "Generate **all** subsets / permutations / combinations / partitions / valid boards".
- n is tiny (≤ 10–15), or the output itself is exponential.
- Constraint satisfaction: N-Queens, Sudoku, word search in a grid.

## The template: choose → explore → un-choose

```java
List<List<Integer>> res = new ArrayList<>();
void backtrack(int start, int[] a, Deque<Integer> path) {
    res.add(new ArrayList<>(path));              // record (copy!) the current state
    for (int i = start; i < a.length; i++) {
        if (i > start && a[i] == a[i - 1]) continue;   // skip duplicates (a sorted)
        path.addLast(a[i]);                       // choose
        backtrack(i + 1, a, path);                // explore (i, not i+1, to allow reuse)
        path.removeLast();                        // un-choose
    }
}
```

| Problem | Recurse with | Notes |
|---|---|---|
| subsets | `i + 1` | record at every node |
| combinations of size k | `i + 1` | record when size == k; prune when not enough elements left |
| combination sum (reuse) | `i` | stop when remaining < 0 (sorted: break) |
| permutations | `used[]` array | record at depth n |
| permutations with duplicates | sort + skip `a[i]==a[i-1] && !used[i-1]` | |
| partition into palindromes | substring end index | precompute isPal table |

## Permutations

```java
void permute(int[] a, boolean[] used, int[] cur, int depth) {
    if (depth == a.length) { /* use cur */ return; }
    for (int i = 0; i < a.length; i++) if (!used[i]) {
        used[i] = true; cur[depth] = a[i];
        permute(a, used, cur, depth + 1);
        used[i] = false;
    }
}
```

Next lexicographic permutation (iterative): find the rightmost `i` with `a[i] < a[i+1]`, swap with the rightmost `j > i` where `a[j] > a[i]`, reverse the suffix after i.

## Subsets with bitmasks (n ≤ 20)

```java
for (int mask = 0; mask < (1 << n); mask++) {
    long sum = 0;
    for (int i = 0; i < n; i++) if ((mask >> i & 1) == 1) sum += a[i];
}
```

Apple Division (CSES): minimize |S − (total − S)| over all subsets.

## Grid search (Word Search)

Mark the cell visited (e.g., overwrite with `'#'`), recurse into 4 neighbors, restore it. Prune early if the next character doesn't match.

## N-Queens with O(1) checks

Track `cols[c]`, `diag1[r + c]`, `diag2[r - c + n - 1]` as booleans (or bitmasks for speed).

## Pruning (what makes backtracking pass)

- Sort the input so you can `break` once a partial sum exceeds the target.
- Check feasibility before recursing (remaining elements ≥ needed).
- Fill the most-constrained cell first (Sudoku).
- Symmetry breaking: fix the first choice (e.g., first element always in group 1).
- Memoize if states repeat → that's DP.
- **Meet in the middle** when n ≈ 40: enumerate halves (2²⁰ each), combine with sort + two pointers / hash map.

## Recursion fundamentals

- Every recursion needs: base case, progress toward it, and a combination step.
- **Divide & conquer**: merge sort, quick power (`x^n = (x^{n/2})²`), Tower of Hanoi (`2ⁿ − 1` moves: move n−1 to aux, move largest, move n−1 on top).
- Gray code: `i ^ (i >> 1)` gives the i-th Gray code.

## Pitfalls

- Adding `path` itself instead of a **copy** to the results (all entries end up identical/empty).
- Forgetting to undo the choice (state leaks into siblings).
- Exponential blowup: estimate the count of leaves before coding (8! = 40 320, 2²⁰ ≈ 10⁶, 10! ≈ 3.6·10⁶).

## Classic problems

- LeetCode: Subsets I/II, Permutations I/II, Combination Sum I/II, Combinations, Palindrome Partitioning, N-Queens, Word Search, Sudoku Solver, Letter Combinations of a Phone Number, Generate Parentheses.
- CSES: Creating Strings, Apple Division, Chessboard and Queens, Grid Path Description, Tower of Hanoi, Gray Code.
