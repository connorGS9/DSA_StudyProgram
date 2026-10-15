---
title: Range Queries (Segment Tree, Fenwick)
order: 22
category: range_queries
---
# Range Queries

## Pick the structure

| Updates | Query | Structure |
|---|---|---|
| none | sum | prefix sums |
| none | min / max / gcd (idempotent) | **sparse table** O(1) query |
| point update | sum / XOR | **Fenwick tree (BIT)** |
| point update | min / max / anything associative | **segment tree** |
| range update | point query | Fenwick on the difference array |
| range update | range sum / min | **lazy segment tree** |
| offline, no updates, hard to merge (distinct count) | | **Mo's algorithm** or sort queries by right end + BIT |

## Fenwick tree (BIT)

```java
class Fenwick {
    long[] t; int n;
    Fenwick(int n) { this.n = n; t = new long[n + 1]; }
    void add(int i, long v) { for (i++; i <= n; i += i & -i) t[i] += v; }     // 0-based i
    long prefix(int i) { long s = 0; for (i++; i > 0; i -= i & -i) s += t[i]; return s; } // sum [0, i]
    long range(int l, int r) { return prefix(r) - (l > 0 ? prefix(l - 1) : 0); }
}
```

- **Count inversions / smaller elements before i**: coordinate-compress values, iterate, query `prefix(v - 1)`, then `add(v, 1)`.
- **k-th smallest present value**: binary lifting on the BIT in O(log n).
- **Distinct values in ranges (offline)**: sort queries by r; for each position keep only the last occurrence of each value in the BIT.

## Segment tree (iterative, point update)

```java
class SegTree {                       // range min; change op + identity for sum/max/gcd
    int n; long[] t; static final long ID = Long.MAX_VALUE;
    SegTree(long[] a) {
        n = a.length; t = new long[2 * n];
        for (int i = 0; i < n; i++) t[n + i] = a[i];
        for (int i = n - 1; i > 0; i--) t[i] = Math.min(t[2 * i], t[2 * i + 1]);
    }
    void set(int i, long v) {
        for (t[i += n] = v; i > 1; i >>= 1) t[i >> 1] = Math.min(t[i], t[i ^ 1]);
    }
    long query(int l, int r) {        // [l, r)
        long res = ID;
        for (l += n, r += n; l < r; l >>= 1, r >>= 1) {
            if ((l & 1) == 1) res = Math.min(res, t[l++]);
            if ((r & 1) == 1) res = Math.min(res, t[--r]);
        }
        return res;
    }
}
```

Nodes can store structs for richer merges: (max subarray sum: total, best prefix, best suffix, best), (count of max), (sorted lists for merge-sort trees).

## Lazy propagation (range add, range sum)

```java
class LazySeg {
    int n; long[] sum, lazy;
    LazySeg(int n) { this.n = n; sum = new long[4 * n]; lazy = new long[4 * n]; }
    void apply(int node, int len, long v) { sum[node] += v * len; lazy[node] += v; }
    void push(int node, int l, int r) {
        if (lazy[node] != 0) {
            int m = (l + r) / 2;
            apply(2 * node, m - l + 1, lazy[node]);
            apply(2 * node + 1, r - m, lazy[node]);
            lazy[node] = 0;
        }
    }
    void update(int node, int l, int r, int ql, int qr, long v) {   // add v on [ql, qr]
        if (qr < l || r < ql) return;
        if (ql <= l && r <= qr) { apply(node, r - l + 1, v); return; }
        push(node, l, r);
        int m = (l + r) / 2;
        update(2 * node, l, m, ql, qr, v);
        update(2 * node + 1, m + 1, r, ql, qr, v);
        sum[node] = sum[2 * node] + sum[2 * node + 1];
    }
    long query(int node, int l, int r, int ql, int qr) {
        if (qr < l || r < ql) return 0;
        if (ql <= l && r <= qr) return sum[node];
        push(node, l, r);
        int m = (l + r) / 2;
        return query(2 * node, l, m, ql, qr) + query(2 * node + 1, m + 1, r, ql, qr);
    }
    // call as update(1, 0, n - 1, l, r, v) and query(1, 0, n - 1, l, r)
}
```

With both "assign" and "add" lazies, apply **assign first** (it overrides pending adds), then add.

## Sparse table (static RMQ)

```java
int LOG = 1; while ((1 << LOG) <= n) LOG++;
int[][] sp = new int[LOG][n];
sp[0] = a.clone();
for (int k = 1; k < LOG; k++)
    for (int i = 0; i + (1 << k) <= n; i++)
        sp[k][i] = Math.min(sp[k - 1][i], sp[k - 1][i + (1 << (k - 1))]);
// min of [l, r] inclusive:
int k = 31 - Integer.numberOfLeadingZeros(r - l + 1);
int mn = Math.min(sp[k][l], sp[k][r - (1 << k) + 1]);
```

## Segment tree tricks

- **Walk down the tree** to find the first index with value ≥ x (Hotel Queries) in O(log n) instead of binary search + query (O(log² n)).
- **Coordinate compression** when indices are values up to 10⁹.
- **Dynamic / sparse segment tree** (create children on demand) when compression is impossible (online).
- **Persistent segment tree**: k-th smallest in a range, versions of arrays.
- **2D**: Fenwick of Fenwicks for point update + rectangle sum (n ≤ 1000).

## Mo's algorithm (offline)

Sort queries by `(l / B, r)` with B ≈ √n; move the two pointers, adding/removing elements in O(1). Total O((n + q)√n). For distinct-count queries, mode frequency, etc.

## Pitfalls

- Mixing inclusive/exclusive ranges between implementations. Pick one per template and comment it.
- Segment tree array of size 4n for the recursive version.
- Forgetting `push` before recursing in lazy trees.
- Identity element: 0 for sum, +∞ for min, −∞ for max, 0 for gcd/XOR.

## Classic problems

- LeetCode: Range Sum Query – Mutable, Count of Smaller Numbers After Self, Count of Range Sum, My Calendar III, Falling Squares, Range Module.
- CSES (whole section): Static Range Minimum Queries, Dynamic Range Sum/Minimum Queries, Range Xor Queries, Range Update Queries, Forest Queries II, Hotel Queries, List Removals, Salary Queries, Prefix Sum Queries, Pizzeria Queries, Range Updates and Sums, Distinct Values Queries, Polynomial Queries.
