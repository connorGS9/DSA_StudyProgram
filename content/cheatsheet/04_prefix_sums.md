---
title: Prefix Sums & Difference Arrays
order: 4
category: prefix_sums
---
# Prefix Sums & Difference Arrays

## Recognize it

- Many **range sum** queries on a static array.
- "Count subarrays whose sum (or XOR, or balance) equals / is divisible by K", including **negative numbers** (where sliding windows fail).
- Many **range update** operations followed by reading the final array → difference array.

## 1D prefix sums

```java
long[] pre = new long[n + 1];             // pre[i] = a[0] + ... + a[i-1]
for (int i = 0; i < n; i++) pre[i + 1] = pre[i] + a[i];
// sum of a[l..r] inclusive = pre[r + 1] - pre[l]
```

## Prefix sum + hashmap (count subarrays)

`sum(l..r) = pre[r+1] - pre[l] = k` ⇔ `pre[l] = pre[r+1] - k`. Count earlier prefixes.

```java
int subarraySum(int[] a, int k) {
    Map<Long, Integer> seen = new HashMap<>();
    seen.put(0L, 1);                       // empty prefix
    long sum = 0; int count = 0;
    for (int x : a) {
        sum += x;
        count += seen.getOrDefault(sum - k, 0);
        seen.merge(sum, 1, Integer::sum);
    }
    return count;
}
```

Variants:
- **Divisible by K**: key = `((sum % k) + k) % k`.
- **Equal 0s and 1s**: map 0 → −1, look for sum 0. Store **first index** of each prefix to get the *longest* subarray.
- **XOR equals K**: same idea with `^`.
- **Parity / bitmask of vowels**: prefix of a bitmask, look for equal masks (or masks differing by one bit).

## 2D prefix sums

```java
long[][] P = new long[n + 1][m + 1];
for (int i = 0; i < n; i++)
    for (int j = 0; j < m; j++)
        P[i + 1][j + 1] = g[i][j] + P[i][j + 1] + P[i + 1][j] - P[i][j];
// sum of rectangle (r1,c1)..(r2,c2) inclusive:
long rect = P[r2 + 1][c2 + 1] - P[r1][c2 + 1] - P[r2 + 1][c1] + P[r1][c1];
```

## Difference array (range add, point read)

```java
long[] d = new long[n + 1];
// add v to a[l..r]
d[l] += v; d[r + 1] -= v;
// recover: a[i] = d[0] + ... + d[i]
for (int i = 1; i < n; i++) d[i] += d[i - 1];
```

- 2D version: `d[r1][c1] += v; d[r1][c2+1] -= v; d[r2+1][c1] -= v; d[r2+1][c2+1] += v;` then 2D prefix sum.
- **Sweep events**: "how many intervals cover point x?" → +1 at start, −1 at end+1, prefix sum (coordinate-compress if coordinates are large).

## Prefix max/min & products

- `prefMax[i]`, `sufMax[i]` → "best element to the left/right of i" in O(1). Used in Trapping Rain Water and best time to buy/sell.
- Product of array except self = prefix product × suffix product.

## Pitfalls

- Off-by-one: use the `n + 1` sized array with `pre[0] = 0` consistently.
- Negative modulo in Java: `-3 % 5 == -3`. Normalize.
- Prefix sums overflow `int` quickly: use `long`.

## Classic problems

- LeetCode: Subarray Sum Equals K, Continuous Subarray Sum, Contiguous Array, Range Sum Query 2D, Car Pooling, Product of Array Except Self.
- CSES: Static Range Sum Queries, Forest Queries, Subarray Sums I/II, Subarray Divisibility, Maximum Subarray Sum II.
