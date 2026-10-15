---
title: Trees
order: 13
category: trees
---
# Trees

## Recognize it

- n nodes and n−1 edges, connected → tree. Root it anywhere (usually node 1).
- Answer for a node depends on its **subtree** → DFS that returns a value (post-order).
- Answer depends on **ancestors/paths** → pass values down (pre-order), LCA, binary lifting.
- "For every node as root…" → **rerooting**.
- Subtree queries with updates → **Euler tour** + Fenwick/segment tree.

## DFS returning values (binary tree)

```java
int best = Integer.MIN_VALUE;
// Max path sum: return the best downward path; update the global answer with both sides
int gain(TreeNode node) {
    if (node == null) return 0;
    int l = Math.max(0, gain(node.left));
    int r = Math.max(0, gain(node.right));
    best = Math.max(best, node.val + l + r);   // path bending at node
    return node.val + Math.max(l, r);          // path continuing upward
}
```

The pattern "**return one thing to the parent, update a global with another**" solves diameter, max path sum, longest univalue path, and binary tree cameras.

## Traversals

- Pre/in/post-order recursively; iterative inorder with a stack (go left as far as possible, pop, go right).
- **Level order** (BFS) with a queue, processing `size` nodes per level: right side view, zigzag, average per level.
- **BST**: inorder is sorted. Validate with `(low, high)` bounds passed down. k-th smallest = k-th in inorder.
- Build tree from preorder + inorder: the root is `pre[0]`; split the inorder at the root (use a value → index map).

## General trees (adjacency lists)

```java
List<Integer>[] g;                 // g[u] = neighbors
int[] parent, depth, sz;
void dfs(int u, int p) {
    parent[u] = p; sz[u] = 1;
    for (int v : g[u]) if (v != p) {
        depth[v] = depth[u] + 1;
        dfs(v, u);
        sz[u] += sz[v];
    }
}
```

For n = 2·10⁵, recursion may overflow the Java stack: run in a big-stack thread or use an iterative DFS (stack + order array, then process in reverse order for post-order).

## Diameter

Two BFS/DFS passes: farthest node `a` from any node; farthest from `a` is `b`; `dist(a, b)` is the diameter. Or DP: `diam = max(top1 + top2)` over nodes.

## LCA with binary lifting

```java
int LOG = 18;
int[][] up;                        // up[k][v] = 2^k-th ancestor
void buildLift(int n) {            // after dfs filled parent[] (root's parent = root) and depth[]
    up = new int[LOG][n];
    up[0] = parent.clone();
    for (int k = 1; k < LOG; k++)
        for (int v = 0; v < n; v++) up[k][v] = up[k - 1][up[k - 1][v]];
}
int lca(int a, int b) {
    if (depth[a] < depth[b]) { int t = a; a = b; b = t; }
    int diff = depth[a] - depth[b];
    for (int k = 0; k < LOG; k++) if ((diff >> k & 1) == 1) a = up[k][a];
    if (a == b) return a;
    for (int k = LOG - 1; k >= 0; k--) if (up[k][a] != up[k][b]) { a = up[k][a]; b = up[k][b]; }
    return up[0][a];
}
// dist(a, b) = depth[a] + depth[b] - 2 * depth[lca(a, b)]
```

Binary lifting also answers "k-th ancestor" (CSES Company Queries I) and works on functional graphs (successor graphs).

## Euler tour (flatten the tree)

Record `tin[u]` when entering and `tout[u]` after the subtree. The subtree of u = positions `[tin[u], tout[u]]` in the order array. Subtree sum queries + point updates → Fenwick tree on that order. Path-to-root sums: add +x at tin and −x at tout+1.

## Rerooting DP

1. Root at 1; compute `down[u]` (answer within the subtree).
2. Second DFS: compute `up[v]` from the parent's full answer minus v's contribution, then `full[v] = combine(down[v], up[v])`.

Example: sum of distances to all nodes: `ans[child] = ans[parent] - sz[child] + (n - sz[child])`.

## Other techniques

- **Small-to-large merging**: merge child sets into the largest one, O(n log² n) total. Used for distinct colors in subtrees.
- **Tree DP (independent set / matching)**: `dp[u][0/1]` = best with u excluded/included (see DP sheet).
- **Centroid decomposition**: count paths with a property (length = k) in O(n log n) levels.
- **Heavy-light decomposition**: path queries with updates using a segment tree.

## Pitfalls

- Undirected edges: pass the parent to avoid walking back.
- Stack overflow on deep trees in Java.
- 0- vs 1-indexed nodes from the input.

## Classic problems

- LeetCode: Maximum Depth, Diameter of Binary Tree, Binary Tree Maximum Path Sum, Lowest Common Ancestor, Validate BST, Serialize and Deserialize, Construct Binary Tree from Preorder and Inorder, Sum of Distances in Tree.
- CSES: Subordinates, Tree Matching, Tree Diameter, Tree Distances I/II, Company Queries I/II, Distance Queries, Subtree Queries, Path Queries, Distinct Colors.
