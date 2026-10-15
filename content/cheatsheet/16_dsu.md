---
title: Union-Find (DSU)
order: 16
category: dsu
---
# Union-Find (Disjoint Set Union)

## Recognize it

- Merge groups and ask "are x and y in the same group?" **online** while edges arrive.
- Count components as edges are added; size of the largest component.
- Kruskal's MST; "redundant connection" (first edge closing a cycle).
- Equations / equivalences ("a == b", "a != b", accounts merge, similar strings).
- **Offline** trick: process queries sorted by a threshold and add edges as the threshold grows. Deletions can be reversed into additions.

## Template (path compression + union by size)

```java
class DSU {
    int[] parent, size;
    int components;
    DSU(int n) {
        parent = new int[n]; size = new int[n]; components = n;
        for (int i = 0; i < n; i++) { parent[i] = i; size[i] = 1; }
    }
    int find(int x) {
        while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }   // path halving
        return x;
    }
    boolean union(int a, int b) {
        a = find(a); b = find(b);
        if (a == b) return false;              // already connected (this edge closes a cycle)
        if (size[a] < size[b]) { int t = a; a = b; b = t; }
        parent[b] = a; size[a] += size[b];
        components--;
        return true;
    }
}
```

Near O(1) amortized per operation (inverse Ackermann).

## Extensions

- **Weighted DSU** (potential / ratio to root): store `diff[x]` = value(x) − value(parent). Update during find. Solves "Evaluate Division" and "are these constraints consistent".
- **DSU on parity**: track `parity[x]` relative to the root to check bipartiteness online / "x and y are in different sets" constraints.
- **Track extra data at the root**: min, max, sum, a list of members (merge smaller into larger).
- **Rollback DSU** (union by size, no path compression) + offline segment tree over time → dynamic connectivity.
- **Grid DSU**: index `r * m + c`; union with the 4 neighbors as cells turn on (Number of Islands II).

## Offline threshold pattern

```text
sort edges by weight; sort queries by limit
for each query in increasing limit:
    add all edges with weight < limit (union)
    answer = connected(u, v)
```

Examples: Checking Existence of Edge Length Limited Paths, swim in water, "max weight such that path exists".

## Pitfalls

- Always compare `find(a) == find(b)`, never `parent[a] == parent[b]`.
- Indexing: map arbitrary keys (strings, coordinates) to ints with a HashMap first.
- Recursive `find` can overflow the stack on long chains before compression; the iterative version above is safe.

## Classic problems

- LeetCode: Number of Provinces, Redundant Connection, Accounts Merge, Longest Consecutive Sequence (DSU version), Evaluate Division, Satisfiability of Equality Equations, Number of Islands II.
- CSES: Road Construction, Building Roads, New Roads Queries.
- Codeforces tag: `dsu`.
