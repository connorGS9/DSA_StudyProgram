---
title: Graph Traversal (BFS/DFS/Topo)
order: 14
category: graphs
---
# Graph Traversal

## Recognize it

- Explicit graph (edges given) **or implicit**: grid cells, states (lock combinations, word ladder), numbers with operations.
- Connectivity / components / islands → DFS or BFS (or DSU).
- **Shortest path with unit weights** → BFS (never DFS).
- Prerequisites, ordering, "is it possible to finish" → **topological sort**.
- Two-coloring, "split into two groups with conflicts" → **bipartite check**.

## Building the graph

```java
int n = in.nextInt(), m = in.nextInt();
List<Integer>[] g = new ArrayList[n + 1];
for (int i = 0; i <= n; i++) g[i] = new ArrayList<>();
for (int i = 0; i < m; i++) {
    int a = in.nextInt(), b = in.nextInt();
    g[a].add(b); g[b].add(a);          // omit the second add for directed graphs
}
```

## BFS (shortest path in unweighted graphs)

```java
int[] bfs(List<Integer>[] g, int src) {
    int[] dist = new int[g.length];
    Arrays.fill(dist, -1);
    ArrayDeque<Integer> q = new ArrayDeque<>();
    dist[src] = 0; q.add(src);
    while (!q.isEmpty()) {
        int u = q.poll();
        for (int v : g[u]) if (dist[v] == -1) {
            dist[v] = dist[u] + 1;
            q.add(v);
        }
    }
    return dist;
}
```

- **Path reconstruction**: store `parent[v] = u`, walk back from the target.
- **Multi-source BFS**: push all sources with distance 0 (rotting oranges, nearest monster, walls and gates).
- **Grid BFS**: encode cell as `r * m + c`, use the 4 direction arrays, check bounds and walls.
- **State BFS**: the node is (position, keys bitmask) or (cell, remaining eliminations). Visited must include the whole state.
- **0-1 BFS**: deque, push weight-0 edges to the front and weight-1 edges to the back.

## DFS (components, flood fill)

```java
boolean[] seen;
void dfs(int u) {
    seen[u] = true;
    for (int v : g[u]) if (!seen[v]) dfs(v);
}
int components = 0;
for (int u = 1; u <= n; u++) if (!seen[u]) { components++; dfs(u); }
```

Iterative version (avoids stack overflow): use an explicit `ArrayDeque<Integer>` stack and mark on push.

## Topological sort (Kahn's algorithm)

```java
int[] topo(List<Integer>[] g, int n) {         // nodes 0..n-1, directed
    int[] indeg = new int[n];
    for (int u = 0; u < n; u++) for (int v : g[u]) indeg[v]++;
    ArrayDeque<Integer> q = new ArrayDeque<>();
    for (int u = 0; u < n; u++) if (indeg[u] == 0) q.add(u);
    int[] order = new int[n]; int k = 0;
    while (!q.isEmpty()) {
        int u = q.poll(); order[k++] = u;
        for (int v : g[u]) if (--indeg[v] == 0) q.add(v);
    }
    return k == n ? order : null;               // null => cycle exists
}
```

- Lexicographically smallest order → replace the queue with a min-heap.
- **DP on DAG** in topological order: longest path, number of paths, max score (Game Routes, Longest Flight Route).

## Cycle detection

- **Undirected**: DFS finds an edge to an already-visited node that isn't the parent (or DSU finds an edge joining the same component).
- **Directed**: 3 colors (0 = unvisited, 1 = on stack, 2 = done); an edge to a color-1 node is a cycle. Or Kahn leaves nodes unprocessed.

## Bipartite check

BFS/DFS coloring with `color[v] = 1 - color[u]`; a conflict means an odd cycle, so not bipartite.

## Functional graphs (each node has exactly one outgoing edge)

Every component is a cycle with trees hanging off it. Find cycles with colors or Floyd; jump k steps with binary lifting (Planets Queries).

## Pitfalls

- Mark visited **when pushing** in BFS, not when popping (otherwise nodes are enqueued many times).
- Disconnected graphs: loop over all start nodes.
- Recursion depth with 10⁵ nodes in Java: iterative DFS.
- Grid: remember `r` is a row (bounded by n) and `c` is a column (bounded by m).

## Classic problems

- LeetCode: Number of Islands, Clone Graph, Rotting Oranges, Pacific Atlantic Water Flow, Course Schedule I/II, Word Ladder, Is Graph Bipartite?, Shortest Path in Binary Matrix, Alien Dictionary.
- CSES: Counting Rooms, Labyrinth, Building Roads, Message Route, Building Teams, Round Trip (I/II), Monsters, Course Schedule, Longest Flight Route, Game Routes, Planets Queries.
