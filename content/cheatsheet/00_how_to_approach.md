---
title: How to Approach a Problem
order: 0
---
# How to Approach a Problem

A repeatable process beats inspiration. Run through it every time, especially when the type is hidden.

## The 6-step loop

1. **Read twice. Restate the task in one sentence.** What is the input, what is asked (count? min? max? yes/no? construct?), and what are the exact constraints?
2. **Work 2–3 tiny examples by hand**, including an edge case (n = 1, all equal, already sorted, negative numbers).
3. **Brute force first.** Say out loud what the O(n!) / O(2ⁿ) / O(n³) solution is. It tells you *what* is being searched, and the optimal solution is usually that search made smarter.
4. **Read the constraints to find the target complexity** (table below) and ask what structure lets you hit it.
5. **Pattern-match** using the signal table below. Write down 2 candidate approaches before committing.
6. **Code, then test on your hand examples plus edge cases** before submitting: n = 1, max n (overflow?), duplicates, negatives, empty answer.

> When stuck for 15+ minutes: re-read the statement (you probably missed a constraint), shrink the problem (solve for n ≤ 20, or only two values), or flip it (count the complement, process in reverse, binary search the answer).

## Constraints → target complexity

Roughly 10⁸ simple operations per second (Java ~ 0.5–1×10⁸ to be safe).

| n up to | Target | Typical techniques |
|---|---|---|
| 10–12 | O(n!) , O(n·n!) | permutations, brute force |
| 20–25 | O(2ⁿ·n) | bitmask DP, subsets, meet-in-the-middle (n ≤ 40) |
| 100–500 | O(n³) | Floyd–Warshall, interval DP, 3 nested loops |
| 2 000–5 000 | O(n²) | 2D DP, all pairs, O(n²) LCS |
| 10⁵–10⁶ | O(n log n) | sorting, binary search, heaps, segment tree, Dijkstra |
| 10⁶–10⁷ | O(n) | two pointers, prefix sums, linear DP, sieve, monotonic stack |
| 10⁹–10¹⁸ | O(log n) / O(√n) | binary search on answer, math formula, matrix exponentiation, digit DP |

**Values (not n) up to 10⁹** → don't index arrays by value; use sorting, hashing, or coordinate compression.
**Answer "modulo 10⁹+7"** → counting problem, almost always DP or combinatorics.
**Sum of n over test cases ≤ 2·10⁵** → per-test O(n log n) is fine; never allocate max-size arrays per test.

## Signal → technique

| If you see… | Think… |
|---|---|
| sorted array, "find a pair/target" | two pointers, binary search |
| contiguous subarray/substring with a constraint | sliding window; prefix sums + hashmap |
| "subarray sum equals k", counting subarrays | prefix sums + hashmap of counts |
| many range-sum queries, no updates | prefix sums |
| range queries **with updates** | Fenwick / segment tree |
| "minimum maximum" / "maximum minimum" / "smallest x such that" | binary search on the answer |
| next greater/smaller element, histogram, "span" | monotonic stack |
| sliding window max/min | monotonic deque |
| top-k, k-th smallest, repeatedly take min/max | heap |
| intervals, meetings, overlaps | sort by start/end, sweep line, heap of end times |
| choosing items optimally where local choice is provably safe | greedy (prove by exchange argument) |
| "number of ways", "min cost to reach", overlapping choices | DP |
| choose/skip items with capacity | knapsack DP |
| two strings, align/compare | 2D DP (LCS/edit distance) |
| shortest path, unweighted grid/graph | BFS |
| shortest path, non-negative weights | Dijkstra |
| weights 0/1 | 0-1 BFS with deque |
| dependencies, ordering, prerequisites | topological sort |
| connectivity, merging groups, "are x and y connected" (online) | union-find |
| tree, answer depends on subtree | DFS returning values (tree DP) |
| path queries on a tree, ancestors | LCA / binary lifting |
| generate all combinations/permutations, n small | backtracking |
| XOR, "subset", n ≤ 20, toggles | bit manipulation, bitmask DP |
| prefix/pattern matching in strings | KMP / Z-function / hashing / trie |
| game, two players play optimally | win/lose DP, Nim/Grundy |
| "construct any valid answer" | constructive: small cases, parity, invariants |

## Edge-case checklist before submitting

- Overflow: does any product/sum exceed 2³¹? Use `long`. Products of two values ≤ 10⁹ exceed `long`? No (10¹⁸ < 9.2·10¹⁸), but three values do.
- Modulo: take `% MOD` after every multiplication; for subtraction use `((a - b) % MOD + MOD) % MOD`.
- Off-by-one: inclusive vs exclusive bounds, 0- vs 1-indexing.
- Empty input, n = 1, all elements equal, strictly decreasing.
- Multiple test cases: reset **all** global state.
- Recursion depth > 10⁴ in Java → run in a thread with a big stack, or make it iterative.

## Explaining your solution (interview style)

Use this for your recorded videos:

1. **Restate** the problem and constraints.
2. **Brute force** and its complexity.
3. **Key insight** in one sentence ("because the array is sorted, moving the left pointer only decreases the sum…").
4. **Algorithm** step by step.
5. **Complexity**: time and space.
6. **Walk through an example** and name the edge cases you handled.
