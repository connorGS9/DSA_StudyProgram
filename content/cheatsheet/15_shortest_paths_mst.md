---
title: Shortest Paths & MST
order: 15
category: shortest_paths
---
# Shortest Paths & Minimum Spanning Trees

## Pick the algorithm

| Situation | Algorithm | Complexity |
|---|---|---|
| unweighted | BFS | O(V + E) |
| weights 0/1 | 0-1 BFS (deque) | O(V + E) |
| non-negative weights, single source | **Dijkstra** | O(E log V) |
| negative weights, detect negative cycles | Bellman–Ford | O(V·E) |
| all pairs, V ≤ 500 | Floyd–Warshall | O(V³) |
| DAG | DP in topological order | O(V + E) |
| connect everything cheaply | Kruskal (DSU) / Prim | O(E log E) |

## Dijkstra

```java
long[] dijkstra(List<int[]>[] g, int src) {      // g[u] = {v, w}
    int n = g.length;
    long[] dist = new long[n];
    Arrays.fill(dist, Long.MAX_VALUE);
    dist[src] = 0;
    PriorityQueue<long[]> pq = new PriorityQueue<>((a, b) -> Long.compare(a[0], b[0]));
    pq.add(new long[]{0, src});
    while (!pq.isEmpty()) {
        long[] top = pq.poll();
        long d = top[0]; int u = (int) top[1];
        if (d > dist[u]) continue;                // stale entry
        for (int[] e : g[u]) {
            long nd = d + e[1];
            if (nd < dist[e[0]]) { dist[e[0]] = nd; pq.add(new long[]{nd, e[0]}); }
        }
    }
    return dist;
}
```

Variants:
- **State-expanded graph**: node = (vertex, couponUsed) for Flight Discount; (vertex, stops) for Cheapest Flights Within K Stops.
- **Count shortest paths / min & max edges on shortest paths**: update counters when `nd == dist[v]` as well as on `nd < dist[v]` (Investigation).
- **K shortest paths**: allow each node to be popped k times (Flight Routes).
- **Minimax path** ("minimize the max edge"): Dijkstra with `max(d, w)` instead of `d + w`, or binary search + BFS, or MST.
- **Reverse graph** for "distance from every node to the target".

## Bellman–Ford

```java
// edges: {u, v, w}; returns null if a negative cycle is reachable from src
long[] bellmanFord(int n, int[][] edges, int src) {
    long INF = Long.MAX_VALUE / 4;
    long[] d = new long[n]; Arrays.fill(d, INF); d[src] = 0;
    for (int i = 0; i < n - 1; i++)
        for (int[] e : edges)
            if (d[e[0]] < INF && d[e[0]] + e[2] < d[e[1]]) d[e[1]] = d[e[0]] + e[2];
    for (int[] e : edges)
        if (d[e[0]] < INF && d[e[0]] + e[2] < d[e[1]]) return null;   // still relaxing
    return d;
}
```

To **print** a negative cycle (CSES Cycle Finding): record the predecessor, take the last relaxed vertex in round n, walk back n times to land inside the cycle, then collect it. "Maximize score" (High Score) = negate weights; only cycles that can reach the destination matter.

## Floyd–Warshall

```java
// d[i][j] initialized to w or INF, d[i][i] = 0
for (int k = 0; k < n; k++)
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
```
Use `INF = Long.MAX_VALUE / 4` so the sum doesn't overflow. **k must be the outer loop.**

## Kruskal's MST

```java
long kruskal(int n, int[][] edges) {               // edges {w, u, v}
    Arrays.sort(edges, (a, b) -> Integer.compare(a[0], b[0]));
    DSU dsu = new DSU(n);
    long total = 0; int used = 0;
    for (int[] e : edges) if (dsu.union(e[1], e[2])) { total += e[0]; used++; }
    return used == n - 1 ? total : -1;           // -1: graph not connected
}
```

(DSU code is on the Union-Find sheet.) **Prim** is Dijkstra-like: grow from one node, always add the cheapest edge leaving the tree. Good for dense graphs (O(V²) with arrays).

MST facts: the max edge on the MST path between u and v is the minimax path; adding the "virtual node" trick (connect a well-cost to a super source) handles "build a well or a pipe" problems.

## Pitfalls

- Dijkstra with negative edges is **wrong**.
- `int` distances overflow: use `long`.
- Forgetting `if (d > dist[u]) continue;` makes Dijkstra slow (TLE).
- Multiple edges between the same pair: keep all (or the min) and don't assume a simple graph.

## Classic problems

- LeetCode: Network Delay Time, Cheapest Flights Within K Stops, Path With Minimum Effort, Min Cost to Connect All Points, Swim in Rising Water, Find the City With the Smallest Number of Neighbors.
- CSES: Shortest Routes I/II, High Score, Flight Discount, Cycle Finding, Flight Routes, Investigation, Road Reparation.
