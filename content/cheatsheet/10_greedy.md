---
title: Greedy
order: 10
category: greedy
---
# Greedy

## Recognize it

- An optimization where **sorting by one key** and taking things in order seems natural.
- A local choice never hurts later: you can argue "any optimal solution can be changed to include my choice without getting worse" (**exchange argument**).
- Constraints too big for DP (n = 10⁵ with values 10⁹) and the problem is "min/max something".

> Greedy is the most common *wrong* first idea. Before coding, try to break it with a small counterexample. If you can't prove it, brute-force small cases and compare.

## Proof tools

- **Exchange argument**: take an optimal solution that differs from greedy at the first position; swap in the greedy choice; show the cost doesn't increase.
- **Stays ahead**: after each step, greedy's partial solution is at least as good as any other's.
- **Sorting by a pairwise key**: if putting A before B is better iff `f(A,B) < f(B,A)`, sort with that comparator (e.g. tasks: sort by `t_A * w_B < t_B * w_A`).

## Interval scheduling (the core greedy)

| Goal | Sort by | Rule |
|---|---|---|
| max non-overlapping intervals | **end** | take if start ≥ last end |
| min removals to make non-overlapping | end | n − (max non-overlapping) |
| min points to stab all intervals (arrows) | end | shoot at end, skip covered |
| min rooms | start | heap of end times |
| min intervals to cover [0, T] | start | among those starting ≤ reach, take the farthest end |

```java
int maxNonOverlapping(int[][] iv) {
    Arrays.sort(iv, (a, b) -> Integer.compare(a[1], b[1]));
    int count = 0; long lastEnd = Long.MIN_VALUE;
    for (int[] x : iv) if (x[0] >= lastEnd) { count++; lastEnd = x[1]; }
    return count;
}
```

## Jump game / reach

```java
// min jumps to reach the end: BFS by layers on reach
int jump(int[] a) {
    int jumps = 0, curEnd = 0, far = 0;
    for (int i = 0; i < a.length - 1; i++) {
        far = Math.max(far, i + a[i]);
        if (i == curEnd) { jumps++; curEnd = far; }
    }
    return jumps;
}
```

## Common greedy shapes

- **Pair extremes**: sort, match smallest with largest (boats/Ferris Wheel, min max pair sum).
- **Two-pass**: candies (left-to-right then right-to-left constraints).
- **Gas station**: if total gas ≥ total cost a solution exists; the start is right after the point where the running sum is lowest.
- **Deadlines with profit**: sort by deadline, keep a min-heap of taken profits, pop the smallest if over capacity ("greedy with regret").
- **Huffman / merge costs**: always merge the two smallest (min-heap). Stick Lengths → median; Stick Divisions → Huffman.
- **Lexicographically smallest**: build character by character, choosing the smallest that keeps the rest feasible (often a monotonic stack).
- **Coin change**: greedy works only for canonical coin systems (1, 5, 10, 25…). Otherwise use DP.
- **Missing coin sum**: sort; if next coin > reach + 1, the answer is reach + 1.

```java
long missingCoinSum(long[] c) {
    Arrays.sort(c);
    long reach = 0;                          // can make every sum in [1, reach]
    for (long x : c) { if (x > reach + 1) break; reach += x; }
    return reach + 1;
}
```

## Pitfalls

- Sort key wrong (sorting intervals by start for "max non-overlapping" is wrong; use end).
- Ties: decide what happens on equal keys.
- Greedy "obviously works" but doesn't: test against brute force on random small inputs.

## Classic problems

- LeetCode: Jump Game I/II, Gas Station, Non-overlapping Intervals, Minimum Number of Arrows, Candy, Task Scheduler, Partition Labels, Boats to Save People.
- CSES: Movie Festival, Ferris Wheel, Stick Lengths, Missing Coin Sum, Tasks and Deadlines, Apartments.
- Codeforces tag: `greedy` (the most common tag, often mixed with sorting).
