---
title: Advanced Techniques
order: 24
category: advanced
---
# Advanced Techniques

These appear in harder Codeforces problems (rating 1900+) and the CSES "Advanced Techniques" section.

## Meet in the middle

n ≈ 40 and 2ⁿ is too much: split into halves, enumerate 2²⁰ subset sums of each, then combine (sort one side + binary search / two pointers, or hash map counts).

```java
// Count subsets with sum == x (CSES Meet in the Middle)
long[] sums(int[] a, int from, int to) {
    int k = to - from; long[] s = new long[1 << k];
    for (int mask = 1; mask < (1 << k); mask++) {
        int low = Integer.numberOfTrailingZeros(mask);
        s[mask] = s[mask & (mask - 1)] + a[from + low];
    }
    return s;
}
// sort right sums; for each left sum L, count right sums equal to x - L with two binary searches
```

## Convex hull trick (CHT)

For `dp[i] = min_j (m_j · x_i + b_j)`: lines `y = m_j x + b_j`, query the min at x.

- Slopes added in monotone order **and** queries monotone → deque, amortized O(1).
- Arbitrary order → **Li Chao tree** (segment tree over x storing lines), O(log C).

```java
// Li Chao tree for MIN over integer x in [lo, hi]
class LiChao {
    long[] M, B; boolean[] has; int lo, hi;
    LiChao(int lo, int hi) { this.lo = lo; this.hi = hi; int sz = 4 * (hi - lo + 1); M = new long[sz]; B = new long[sz]; has = new boolean[sz]; }
    long f(long m, long b, long x) { return m * x + b; }
    void add(long m, long b) { add(1, lo, hi, m, b); }
    void add(int node, int l, int r, long m, long b) {
        if (!has[node]) { has[node] = true; M[node] = m; B[node] = b; return; }
        int mid = (l + r) >> 1;
        boolean leftBetter = f(m, b, l) < f(M[node], B[node], l);
        boolean midBetter = f(m, b, mid) < f(M[node], B[node], mid);
        if (midBetter) { long t = M[node]; M[node] = m; m = t; t = B[node]; B[node] = b; b = t; }
        if (l == r) return;
        if (leftBetter != midBetter) add(2 * node, l, mid, m, b);
        else add(2 * node + 1, mid + 1, r, m, b);
    }
    long query(long x) {
        long res = Long.MAX_VALUE; int node = 1, l = lo, r = hi;
        while (true) {
            if (has[node]) res = Math.min(res, f(M[node], B[node], x));
            if (l == r || !has[node]) return res;
            int mid = (l + r) >> 1;
            if (x <= mid) { node = 2 * node; r = mid; } else { node = 2 * node + 1; l = mid + 1; }
        }
    }
}
```

CSES Monster Game I/II, Frog 3 (AtCoder).

## Divide & conquer DP optimization

`dp[k][i] = min_{j < i} dp[k-1][j] + cost(j, i)` where the best j (`opt`) is monotone in i:

```java
void compute(int k, int l, int r, int optL, int optR) {
    if (l > r) return;
    int mid = (l + r) >> 1, best = optL;
    long bestVal = Long.MAX_VALUE;
    for (int j = optL; j <= Math.min(mid - 1, optR); j++) {
        long v = prev[j] + cost(j, mid);
        if (v < bestVal) { bestVal = v; best = j; }
    }
    cur[mid] = bestVal;
    compute(k, l, mid - 1, optL, best);
    compute(k, mid + 1, r, best, optR);
}
```

O(k · n log n). Typical: split an array into k groups minimizing the sum of (group sum)² (CSES Subarray Squares).

## Knuth's optimization

Interval DP `dp[l][r] = min_{l ≤ k < r} dp[l][k] + dp[k+1][r] + C(l, r)` with `opt[l][r-1] ≤ opt[l][r] ≤ opt[l+1][r]` → restrict k to that range, O(n²) total (optimal merge of files, CSES Knuth Division).

## Small-to-large merging

Merge smaller collections into larger ones: each element moves O(log n) times. Distinct colors in subtrees, offline dynamic connectivity, DSU with lists.

## Square-root decomposition

Split into blocks of size √n. Each query touches O(√n) blocks plus partial blocks. Also "heavy/light by threshold": treat values with frequency > √n separately.

## Bitset speed-ups

`long[]` operations process 64 booleans at once: subset-sum reachability up to 10⁶, counting triangles / common neighbors (Beautiful Subgrids), reachability in DAGs (Reachable Nodes: `reach[u] |= reach[v]`).

## FFT / NTT (polynomial multiplication)

Multiply two polynomials of degree n in O(n log n). Uses: counting pairs with given sums (Apples and Bananas), convolution of indicator arrays, string matching with wildcards. Use NTT with mod 998244353 for exact integer results; FFT with doubles when values are small.

## Implicit treap

Balanced BST keyed by position: split/merge at index in O(log n). Supports cut-and-paste of segments, reversals with a lazy flag (CSES Cut and Paste, Substring Reversals, Reversals and Sums).

## Offline tricks

- Process queries sorted by one parameter (threshold DSU, sweepline + BIT).
- Reverse time: deletions become insertions (DSU can't delete).
- Divide and conquer over time / parallel binary search for "when does X first become true" for many queries.

## Classic problems

- CSES: Meet in the Middle, Hamming Distance, Beautiful Subgrids, Reachable Nodes, Reachability Queries, Cut and Paste, Substring Reversals, Reversals and Sums, Necessary Roads, Necessary Cities, Eulerian Subgraphs, Monster Game I/II, Subarray Squares, Houses and Schools, Knuth Division, Apples and Bananas, One Bit Positions, Signal Processing, New Roads Queries, Dynamic Connectivity, Parcel Delivery, Task Assignment, Distinct Routes II.
- AtCoder EDPC: Frog 3 (CHT), Slimes (Knuth/interval).
