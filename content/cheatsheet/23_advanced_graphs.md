---
title: Advanced Graphs
order: 23
category: advanced_graphs
---
# Advanced Graphs

## Recognize it

| Signal | Tool |
|---|---|
| "mutually reachable", condense cycles, DP on a graph with cycles | **SCC** (Kosaraju / Tarjan) → DAG |
| edges/vertices whose removal disconnects the graph | **bridges / articulation points** (low-link) |
| boolean variables with "a or b" clauses | **2-SAT** (SCC on the implication graph) |
| max throughput, min cut, edge-disjoint paths | **max flow** (Dinic) |
| pair up two sides (jobs ↔ workers) | **bipartite matching** (Kuhn / Hopcroft–Karp / flow) |
| use every edge exactly once | **Euler path/circuit** (Hierholzer) |
| visit every vertex exactly once, n ≤ 20 | Hamiltonian path via bitmask DP |

## Strongly connected components (Kosaraju)

```java
// 1) DFS on g, push vertices by finish time. 2) DFS on the reversed graph in reverse finish order.
List<Integer>[] g, rg; boolean[] vis; int[] comp; ArrayDeque<Integer> order = new ArrayDeque<>();
void dfs1(int u) { vis[u] = true; for (int v : g[u]) if (!vis[v]) dfs1(v); order.push(u); }
void dfs2(int u, int c) { comp[u] = c; for (int v : rg[u]) if (comp[v] == -1) dfs2(v, c); }
int scc(int n) {
    vis = new boolean[n]; comp = new int[n]; Arrays.fill(comp, -1);
    for (int u = 0; u < n; u++) if (!vis[u]) dfs1(u);
    int c = 0;
    while (!order.isEmpty()) { int u = order.pop(); if (comp[u] == -1) dfs2(u, c++); }
    return c;   // components are numbered in topological order of the condensation
}
```

Recursion is deep for n = 10⁵: use a big-stack thread or an iterative DFS.

## Bridges and articulation points

```java
int timer = 0; int[] tin, low;
void dfs(int u, int parentEdge) {
    tin[u] = low[u] = ++timer;
    for (int[] e : g[u]) {                        // e = {v, edgeId}
        int v = e[0];
        if (e[1] == parentEdge) continue;
        if (tin[v] != 0) low[u] = Math.min(low[u], tin[v]);
        else {
            dfs(v, e[1]);
            low[u] = Math.min(low[u], low[v]);
            if (low[v] > tin[u]) { /* edge u-v is a bridge */ }
            // articulation: low[v] >= tin[u] for non-root u; root with >= 2 DFS children
        }
    }
}
```

Using edge ids (not the parent vertex) handles multi-edges correctly.

## 2-SAT

Variable x has nodes `2x` (true) and `2x+1` (false). Clause (a ∨ b) adds implications ¬a → b and ¬b → a. Unsatisfiable iff x and ¬x are in the same SCC. Assignment: with Kosaraju's numbering above (topological order), set x = true iff `comp[2x] > comp[2x+1]`.

## Max flow (Dinic)

```java
class Dinic {
    int n; int[] head, nxt, to, level, it; long[] cap; int ec = 0;
    Dinic(int n, int maxEdges) {
        this.n = n; head = new int[n]; Arrays.fill(head, -1);
        nxt = new int[2 * maxEdges]; to = new int[2 * maxEdges]; cap = new long[2 * maxEdges];
        level = new int[n]; it = new int[n];
    }
    void addEdge(int u, int v, long c) {
        to[ec] = v; cap[ec] = c; nxt[ec] = head[u]; head[u] = ec++;
        to[ec] = u; cap[ec] = 0; nxt[ec] = head[v]; head[v] = ec++;   // reverse edge
    }
    boolean bfs(int s, int t) {
        Arrays.fill(level, -1); level[s] = 0;
        ArrayDeque<Integer> q = new ArrayDeque<>(); q.add(s);
        while (!q.isEmpty()) {
            int u = q.poll();
            for (int e = head[u]; e != -1; e = nxt[e])
                if (cap[e] > 0 && level[to[e]] < 0) { level[to[e]] = level[u] + 1; q.add(to[e]); }
        }
        return level[t] >= 0;
    }
    long dfs(int u, int t, long f) {
        if (u == t) return f;
        for (; it[u] != -1; it[u] = nxt[it[u]]) {
            int e = it[u], v = to[e];
            if (cap[e] > 0 && level[v] == level[u] + 1) {
                long d = dfs(v, t, Math.min(f, cap[e]));
                if (d > 0) { cap[e] -= d; cap[e ^ 1] += d; return d; }
            }
        }
        return 0;
    }
    long maxFlow(int s, int t) {
        long flow = 0;
        while (bfs(s, t)) {
            System.arraycopy(head, 0, it, 0, n);
            long f;
            while ((f = dfs(s, t, Long.MAX_VALUE)) > 0) flow += f;
        }
        return flow;
    }
}
```

- **Min cut** = max flow. The cut edges go from vertices reachable from s in the residual graph to unreachable ones (Police Chase).
- **Edge-disjoint paths** = max flow with unit capacities (Distinct Routes); **vertex-disjoint**: split each vertex into in/out with capacity 1.
- **Bipartite matching** = flow from source → left (cap 1) → right (cap 1) → sink (School Dance).
- **Min cost flow**: Bellman–Ford/SPFA augmenting paths (Task Assignment = Hungarian / min-cost matching).

## Bipartite matching (Kuhn, O(V·E))

```java
int[] matchR; boolean[] used;      // matchR[right] = left or -1
boolean tryKuhn(int u) {
    for (int v : g[u]) if (!used[v]) {
        used[v] = true;
        if (matchR[v] == -1 || tryKuhn(matchR[v])) { matchR[v] = u; return true; }
    }
    return false;
}
// for each left u: Arrays.fill(used, false); if (tryKuhn(u)) matching++;
```

König's theorem: in bipartite graphs, max matching = min vertex cover; max independent set = V − matching.

## Euler path / circuit (Hierholzer)

- Undirected circuit exists iff all degrees are even (in the component with edges); path iff exactly 0 or 2 odd vertices.
- Directed circuit: in = out everywhere; path: start has out = in + 1, end has in = out + 1.

```java
// Iterative Hierholzer on directed graph with adjacency lists g; idx[u] = next edge to use
List<Integer> euler(int start) {
    ArrayDeque<Integer> st = new ArrayDeque<>(); List<Integer> path = new ArrayList<>();
    st.push(start);
    while (!st.isEmpty()) {
        int u = st.peek();
        if (idx[u] < g[u].size()) st.push(g[u].get(idx[u]++));
        else path.add(st.pop());
    }
    Collections.reverse(path);
    return path;   // check path.size() == edges + 1, otherwise the graph is disconnected
}
```

For undirected graphs mark each edge id as used so it isn't traversed twice. De Bruijn sequences = an Euler circuit on (k−1)-length strings.

## Pitfalls

- Recursion depth for Tarjan/Kosaraju/DFS-based algorithms in Java.
- Flow: forgetting reverse edges, using `int` capacities that overflow.
- Euler: verify connectivity and the edge count, not just degrees.

## Classic problems

- LeetCode: Critical Connections in a Network, Reconstruct Itinerary (Euler), Cracking the Safe (De Bruijn), Maximum Students Taking Exam (matching).
- CSES: Planets and Kingdoms, Giant Pizza, Coin Collector, Mail Delivery, De Bruijn Sequence, Teleporters Path, Download Speed, Police Chase, School Dance, Distinct Routes, Necessary Roads, Necessary Cities.
