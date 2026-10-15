---
title: Arrays & Hashing
order: 2
category: arrays
---
# Arrays & Hashing

## Recognize it

- "Find duplicates / pairs / groups", "first unique", "anagram", "count frequency".
- You need O(1) lookup of "have I seen X?" or "how many times?".
- A brute force O(n²) pair check can be replaced by "for each element, look up its complement".

## Frequency counting & complements

```java
// Two Sum: index of complement seen so far, O(n)
int[] twoSum(int[] a, int target) {
    Map<Integer, Integer> seen = new HashMap<>();
    for (int i = 0; i < a.length; i++) {
        Integer j = seen.get(target - a[i]);
        if (j != null) return new int[]{j, i};
        seen.put(a[i], i);
    }
    return null;
}
```

- Counting pairs with `a[i] + a[j] == k`: for each x, add `count[k - x]` **before** inserting x (avoids pairing x with itself).
- Small value range (e.g. lowercase letters, values ≤ 10⁶): use an `int[]` instead of a HashMap, which is much faster.

## Canonical keys for grouping

Group items that are "the same up to X" by mapping each to a canonical key:

| Equivalence | Key |
|---|---|
| anagrams | sorted string, or 26-count array → `Arrays.toString(cnt)` |
| same shape up to shift | sequence of differences |
| same ratio | reduced fraction `(a/g, b/g)` with sign normalized |
| same line through origin | `(dx/g, dy/g)` with sign normalized |

## In-place array tricks

- **Index as hash** (values in 1..n): mark presence by negating `a[|v| - 1]`. Solves "missing/duplicate number" in O(1) extra space.
- **Cyclic sort**: place value v at index v−1 by swapping, then scan for mismatches.
- **Reverse to rotate**: rotate right by k = reverse all, reverse first k, reverse rest.
- **Dutch national flag** (three-way partition) with pointers `lo, mid, hi`.
- **Kadane** (max subarray): `cur = max(x, cur + x); best = max(best, cur)`.
- **Boyer–Moore majority vote**: candidate/count, finds the element appearing > n/2 times in O(1) space.

```java
int majority(int[] a) {
    int cand = 0, cnt = 0;
    for (int x : a) {
        if (cnt == 0) cand = x;
        cnt += (x == cand) ? 1 : -1;
    }
    return cand; // verify with a second pass if a majority isn't guaranteed
}
```

## Matrix patterns

- Directions array: `int[] dr = {-1, 1, 0, 0}, dc = {0, 0, -1, 1};`
- Rotate 90° clockwise in place = transpose, then reverse each row.
- Spiral order: shrink four boundaries `top, bottom, left, right`.
- Diagonals: cells on the same diagonal share `r - c`; anti-diagonal share `r + c`.

## Pitfalls

- HashMap of `Integer` boxes values, so it's slow for 10⁶+ operations. Prefer arrays or sorting + two pointers.
- Mutating a key object after putting it in a HashMap breaks lookups.
- Use `long` for sums of many ints.

## Classic problems

- LeetCode: Two Sum, Group Anagrams, Top K Frequent Elements, Product of Array Except Self, Longest Consecutive Sequence, First Missing Positive, Majority Element.
- CSES: Distinct Numbers, Missing Number.
