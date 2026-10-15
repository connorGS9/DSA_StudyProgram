---
title: Binary Search
order: 6
category: binary_search
---
# Binary Search

## Recognize it

- Sorted data and you need a position → classic binary search.
- "**Minimize the maximum**", "**maximize the minimum**", "smallest X such that it's possible", "earliest day when…" → **binary search on the answer**.
- You can write a function `ok(x)` that is **monotone**: false, false, …, false, true, true, … That's all binary search needs.
- n up to 10⁵ but the answer range up to 10⁹–10¹⁸: log₂(10¹⁸) ≈ 60 checks.

## The one template to remember

Find the **first x in [lo, hi] where ok(x) is true** (assuming ok(hi) is true):

```java
long lo = LOW, hi = HIGH;          // answer is in [lo, hi]
while (lo < hi) {
    long mid = lo + (hi - lo) / 2;   // floor; avoids overflow
    if (ok(mid)) hi = mid;           // mid works: answer is mid or to the left
    else lo = mid + 1;               // mid fails: answer is to the right
}
// lo == hi == first true
```

For the **last x where ok(x) is true** (true…true false…false), use `mid = lo + (hi - lo + 1) / 2`, `if (ok(mid)) lo = mid; else hi = mid - 1;`. The `+1` prevents an infinite loop.

## lower_bound / upper_bound

```java
// first index i with a[i] >= x  (a.length if none)
int lowerBound(int[] a, int x) {
    int lo = 0, hi = a.length;
    while (lo < hi) { int m = (lo + hi) >>> 1; if (a[m] >= x) hi = m; else lo = m + 1; }
    return lo;
}
// first index i with a[i] > x: change to a[m] > x
// count of x = upperBound - lowerBound
```

## Binary search on the answer

```java
// Koko eating bananas / Factory Machines style: min time T so that sum(T / t_i) >= target
long minTime(int[] t, long target) {
    long lo = 1, hi = (long) 1e18;
    while (lo < hi) {
        long mid = lo + (hi - lo) / 2;
        long made = 0;
        for (int x : t) { made += mid / x; if (made >= target) break; }   // break avoids overflow
        if (made >= target) hi = mid; else lo = mid + 1;
    }
    return lo;
}
```

Typical `ok` checks are **greedy**: "can we split the array into ≤ k parts with max sum ≤ mid?" (scan and cut when exceeding), "can we place cows with min distance ≥ mid?".

## Rotated sorted array

One half `[lo, mid]` or `[mid, hi]` is always sorted. Check whether the target lies in the sorted half and recurse into that half or the other.

## Search on real numbers

Loop a fixed number of times (e.g. 100 iterations) instead of comparing with epsilon:

```java
double lo = 0, hi = 1e9;
for (int it = 0; it < 100; it++) { double mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
```

## Ternary search (unimodal function)

For a function that decreases then increases: compare `f(m1)` and `f(m2)` and drop the worse third. On integers, stop when `hi - lo < 3` and brute force the rest. Often replaceable by a binary search on `f(x+1) - f(x) >= 0`.

## Binary search the median of two sorted arrays

Partition both arrays so that the left halves have total size ⌊(m+n+1)/2⌋ and `maxLeft <= minRight`. Binary search the cut in the smaller array.

## Pitfalls

- `(lo + hi) / 2` overflows for large ints: use `lo + (hi - lo) / 2` or `>>> 1`.
- Infinite loop: the `mid` rounding must move toward the side you *don't* assign `mid` to.
- Wrong bounds: make sure the answer is inside `[lo, hi]` initially (is `hi` always feasible?).
- Overflow inside `ok()` (summing up to 10¹⁸ × n): break early.

## Classic problems

- LeetCode: Binary Search, Search in Rotated Sorted Array, Find Minimum in Rotated Sorted Array, Koko Eating Bananas, Split Array Largest Sum, Median of Two Sorted Arrays, Capacity To Ship Packages.
- CSES: Factory Machines, Array Division, Multiplication Table.
- Codeforces tag: `binary search`.
