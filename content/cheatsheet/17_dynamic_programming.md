---
title: Dynamic Programming
order: 17
category: dp
---
# Dynamic Programming

## Recognize it

- "Number of ways", "minimum cost", "maximum value", "is it possible", often **mod 10⁹+7**.
- Decisions at each step (take/skip, go left/right, cut here or not) where **future options depend only on a small summary of the past**: index, remaining capacity, last element, a mask.
- A brute-force recursion recomputes the same subproblems (overlapping subproblems).
- Greedy fails on a small counterexample.

## The DP framework (do this every time)

1. **State**: what minimal information describes a subproblem? Write it in words: "`dp[i][j]` = min cost to make the first i items with j remaining…".
2. **Transition**: how does a state depend on smaller ones? Consider the **last decision**.
3. **Base cases**: empty prefix, zero capacity…
4. **Order**: make sure dependencies are computed first (or use memoized recursion).
5. **Answer**: which state(s) hold it? Is it `dp[n]`, `max over j of dp[n][j]`…?
6. **Complexity** = #states × transition cost. Too big → reduce the state or speed up the transition (see Optimizations).

Top-down (memoized recursion) is easier to get right; bottom-up is faster and avoids Java stack overflow. Space can usually be reduced to the previous row.

```java
// Memoization skeleton
long[] memo; boolean[] done;
long f(int i) {
    if (i == n) return 0;                        // base case
    if (done[i]) return memo[i];
    long best = /* transitions using f(i + 1), f(i + 2), ... */ 0;
    done[i] = true;
    return memo[i] = best;
}
```

## 1D linear DP

`dp[i]` depends on a few previous entries.

- **Climbing stairs / Dice Combinations**: `dp[i] = Σ dp[i - k]` for allowed steps k.
- **House Robber**: `dp[i] = max(dp[i-1], dp[i-2] + a[i])`. Circular: run twice (exclude first or last).
- **Decode Ways**: one-digit and two-digit transitions.
- **Max subarray (Kadane)** is DP: `best ending at i = max(a[i], bestEnding(i-1) + a[i])`.
- **State machines**: stock buy/sell with cooldown/fee. `hold[i]`, `sold[i]`, `rest[i]` with transitions between them.

```java
// Stock with cooldown: three states per day
int maxProfit(int[] p) {
    int hold = Integer.MIN_VALUE / 2, sold = 0, rest = 0;
    for (int x : p) {
        int prevSold = sold;
        sold = hold + x;
        hold = Math.max(hold, rest - x);
        rest = Math.max(rest, prevSold);
    }
    return Math.max(sold, rest);
}
```

## Knapsack family

**0/1 knapsack** (each item once). Iterate capacity **downward** in the 1D version:

```java
long knapsack01(int[] w, int[] v, int W) {
    long[] dp = new long[W + 1];                     // dp[c] = best value with capacity c
    for (int i = 0; i < w.length; i++)
        for (int c = W; c >= w[i]; c--)              // downward: item used at most once
            dp[c] = Math.max(dp[c], dp[c - w[i]] + v[i]);
    return dp[W];
}
```

**Unbounded** (reuse items): iterate capacity **upward**.

| Problem | dp meaning | Loop order |
|---|---|---|
| min coins (Minimizing Coins) | min coins for sum s | items any order, sums upward |
| # ordered ways (Coin Combinations I) | ways to make s, order matters | **sum outer**, coins inner |
| # unordered ways (Coin Combinations II) | ways, order doesn't matter | **coins outer**, sum inner |
| subset sum / partition equal subset | reachable sums (boolean or `BitSet`) | 0/1 downward |
| target sum with ± signs | subset with sum (total + target) / 2 | 0/1 downward |
| bounded knapsack (k copies) | split k into powers of two (1, 2, 4, …) → 0/1 items | |

- Huge capacity but small values → swap roles: `dp[value] = min weight`.
- Money Sums (all reachable sums) → boolean 0/1 knapsack.

## LIS (longest increasing subsequence)

O(n log n) with patience sorting: `tails[k]` = smallest possible tail of an increasing subsequence of length k+1.

```java
int lis(int[] a) {
    int[] tails = new int[a.length]; int len = 0;
    for (int x : a) {
        int lo = 0, hi = len;                  // first tail >= x (strictly increasing)
        while (lo < hi) { int m = (lo + hi) >>> 1; if (tails[m] < x) lo = m + 1; else hi = m; }
        tails[lo] = x;
        if (lo == len) len++;
    }
    return len;
}
// Non-decreasing: search for the first tail > x instead.
```

- **Russian dolls / box stacking**: sort by width ascending and height **descending** for equal widths, then LIS on heights.
- Count LIS: O(n²) DP with `len[i]` and `cnt[i]`, or a Fenwick tree over compressed values.
- Min deletions to make sorted = n − LIS.

## Grid DP

`dp[r][c]` from top/left neighbors. Unique Paths, Minimum Path Sum, Grid Paths with obstacles, Maximal Square (`dp = 1 + min(top, left, diag)`).

- Two walkers at once (Cherry Pickup): state `(step, r1, r2)`; `c = step - r`.
- Path in a DAG-shaped grid only; if moves can go back, it's a shortest-path problem, not DP.

## String DP (two sequences)

`dp[i][j]` = answer for prefixes `a[0..i)` and `b[0..j)`.

```java
int editDistance(String a, String b) {
    int n = a.length(), m = b.length();
    int[][] dp = new int[n + 1][m + 1];
    for (int i = 0; i <= n; i++) dp[i][0] = i;
    for (int j = 0; j <= m; j++) dp[0][j] = j;
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= m; j++)
            dp[i][j] = a.charAt(i - 1) == b.charAt(j - 1)
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j - 1], Math.min(dp[i - 1][j], dp[i][j - 1]));
    return dp[n][m];
}
```

| Problem | Transition on match / mismatch |
|---|---|
| LCS | match: `dp[i-1][j-1] + 1`; else `max(dp[i-1][j], dp[i][j-1])` |
| Edit distance | match: `dp[i-1][j-1]`; else `1 + min(replace, delete, insert)` |
| Distinct subsequences (count t in s) | `dp[i-1][j] + (match ? dp[i-1][j-1] : 0)` |
| Wildcard / regex matching | `*` = empty (`dp[i][j-1]`) or consume (`dp[i-1][j]`) |
| Interleaving string | `dp[i][j]` from `dp[i-1][j]` or `dp[i][j-1]` |
| Longest palindromic subsequence | LCS(s, reverse(s)), or interval DP |

Reconstruct the actual LCS by walking back from `dp[n][m]`.

## Interval DP

`dp[l][r]` = answer for the segment `[l, r]`; iterate by **increasing length**; try a split point k or the "last" action.

```java
// Burst Balloons: k = LAST balloon burst in (l, r)
for (int len = 2; len < n; len++)
    for (int l = 0; l + len < n; l++) {
        int r = l + len;
        for (int k = l + 1; k < r; k++)
            dp[l][r] = Math.max(dp[l][r], dp[l][k] + dp[k][r] + v[l] * v[k] * v[r]);
    }
```

- Matrix chain multiplication, merging stones, minimum cost to cut a stick, palindrome partitioning (min cuts), Removal Game (`dp[l][r] = max(a[l] - dp[l+1][r], a[r] - dp[l][r-1])` as a score difference).
- O(n³) → n ≤ 500. Knuth's optimization can make some O(n²).

## Bitmask DP

n ≤ 20: the state includes a subset as an int mask.

```java
// TSP / Hamiltonian path: dp[mask][v] = min cost to visit exactly `mask`, ending at v
long[][] dp = new long[1 << n][n];
for (long[] row : dp) Arrays.fill(row, INF);
dp[1][0] = 0;                                         // start at node 0
for (int mask = 1; mask < (1 << n); mask++)
    for (int v = 0; v < n; v++) {
        if (dp[mask][v] == INF || (mask >> v & 1) == 0) continue;
        for (int u = 0; u < n; u++) if ((mask >> u & 1) == 0)
            dp[mask | 1 << u][u] = Math.min(dp[mask | 1 << u][u], dp[mask][v] + cost[v][u]);
    }
```

- **Assignment** (n workers × n jobs): `dp[mask]` where the worker index = `popcount(mask)`.
- **Elevator Rides / bin packing**: `dp[mask] = (min rides, weight in last ride)`.
- **Iterate submasks**: `for (int s = mask; s > 0; s = (s - 1) & mask)`. Total over all masks is O(3ⁿ).
- **Broken profile / tiling** (Counting Tilings): process cell by cell with a mask of the frontier.
- **SOS DP** (sum over subsets): `for bit: for mask: if (mask has bit) f[mask] += f[mask ^ bit]`, O(n·2ⁿ).

## Digit DP

Count numbers in `[L, R]` with a digit property: `count(R) − count(L − 1)`. State: `(pos, tight, started, …property state…)`.

```java
// Count numbers in [0, X] with no two adjacent equal digits (CSES Counting Numbers)
char[] d; long[][][][] memo;                         // pos, last digit (10 = none), tight, started
long go(int pos, int last, int tight, int started) {
    if (pos == d.length) return 1;
    if (memo[pos][last][tight][started] != -1) return memo[pos][last][tight][started];
    int limit = tight == 1 ? d[pos] - '0' : 9;
    long res = 0;
    for (int x = 0; x <= limit; x++) {
        if (started == 1 && x == last) continue;     // adjacent equal digits not allowed
        int ns = (started == 1 || x != 0) ? 1 : 0;
        res += go(pos + 1, ns == 1 ? x : 10, (tight == 1 && x == limit) ? 1 : 0, ns);
    }
    return memo[pos][last][tight][started] = res;
}
long count(long X) {                                  // X >= 0
    d = Long.toString(X).toCharArray();
    memo = new long[d.length][11][2][2];
    for (long[][][] a : memo) for (long[][] b : a) for (long[] c : b) Arrays.fill(c, -1);
    return go(0, 10, 1, 0);
}
```

Typical property states: sum of digits mod k, count of a digit, last digit, number mod m.

## Tree DP

Post-order DFS; `dp[u][…]` combines children.

```java
// Max independent set on a tree: dp0 = u not taken, dp1 = u taken
void dfs(int u, int p) {
    dp1[u] = val[u];
    for (int v : g[u]) if (v != p) {
        dfs(v, u);
        dp0[u] += Math.max(dp0[v], dp1[v]);
        dp1[u] += dp0[v];
    }
}
```

- Tree matching (CSES): `dp[u][0/1]` = u unmatched/matched.
- House Robber III, Binary Tree Cameras (3 states), counting subtrees.
- Knapsack on trees (pick k nodes): merging children is O(n²) overall if you bound sizes by subtree sizes.
- **Rerooting** for "answer for every root": see the Trees sheet.

## DP on DAGs & graphs

Process in topological order (or memoized DFS): longest path, number of paths (Game Routes), max coins (with SCC condensation first if there are cycles). Shortest path with "at most k edges" = Bellman–Ford-like layered DP.

## Probability & expected value

- `dp[state] = Σ P(transition) × dp[next]`.
- **Linearity of expectation**: E[sum] = sum of E[parts] even for dependent parts. Often avoids DP entirely.
- Expected steps with self-loops: `E = 1 + p·E + (1 − p)·E'` → solve for E.
- Dice Probability (CSES): `dp[i][s]` = probability of sum s after i throws.
- Under a modulus: divide by multiplying with the modular inverse.

## Counting DP (mod)

- Take `% MOD` on every addition; for subtraction add MOD back.
- Partition a number into parts (order matters vs not) = the two coin-combination loop orders.
- "Number of arrays of length n with constraint on adjacent elements" (Array Description): `dp[i][v]` from `dp[i-1][v-1..v+1]`.
- Counting Towers / tilings: find a small set of states per column and their transitions (or matrix exponentiation when n is huge).

## DP optimizations

| Transition looks like | Speed-up |
|---|---|
| `dp[i] = Σ dp[j]` over a range of j | prefix sums of dp |
| `dp[i] = min(dp[j]) + c` over a sliding range | monotonic deque |
| `dp[i] = min_j (dp[j] + b[j]·a[i])` | **convex hull trick** / Li Chao tree |
| `dp[k][i] = min_{j<i} dp[k-1][j] + cost(j, i)` with monotone opt | **divide & conquer optimization** O(k n log n) |
| interval DP with quadrangle inequality | **Knuth** O(n²) |
| linear recurrence, n up to 10¹⁸ | **matrix exponentiation** O(s³ log n) |
| count over "exactly k" items with a convex cost | Aliens trick (Lagrangian relaxation) |

```java
// Matrix exponentiation for Fibonacci-like recurrences
long[][] mul(long[][] A, long[][] B) {
    int n = A.length; long[][] C = new long[n][n];
    for (int i = 0; i < n; i++) for (int k = 0; k < n; k++) if (A[i][k] != 0)
        for (int j = 0; j < n; j++) C[i][j] = (C[i][j] + A[i][k] * B[k][j]) % MOD;
    return C;
}
long[][] matPow(long[][] M, long e) {
    int n = M.length; long[][] R = new long[n][n];
    for (int i = 0; i < n; i++) R[i][i] = 1;
    while (e > 0) { if ((e & 1) == 1) R = mul(R, M); M = mul(M, M); e >>= 1; }
    return R;
}
```

## Pitfalls

- Wrong loop direction in knapsack (reusing vs not reusing items).
- Uninitialized "impossible" states: use INF for min-problems and −INF for max-problems, and **skip** them in transitions (INF + x overflows).
- Memo sentinel collides with a valid value (use a separate `boolean[] done` or −1 when answers are ≥ 0).
- Forgetting to reset memo between test cases.
- State too big: 5000 × 5000 `long` = 200 MB. Roll the array or use `int`.

## Classic problems

- LeetCode: Climbing Stairs, House Robber I/II/III, Coin Change I/II, Longest Increasing Subsequence, Longest Common Subsequence, Edit Distance, Partition Equal Subset Sum, Word Break, Burst Balloons, Regular Expression Matching, Best Time to Buy and Sell Stock (all variants).
- CSES (the best DP set there is): Dice Combinations, Minimizing Coins, Coin Combinations I/II, Removing Digits, Grid Paths, Book Shop, Array Description, Counting Towers, Edit Distance, Rectangle Cutting, Money Sums, Removal Game, Two Sets II, Increasing Subsequence, Projects, Elevator Rides, Counting Tilings, Counting Numbers.
- AtCoder Educational DP Contest (A–Z) is the gold standard for practising each type.
