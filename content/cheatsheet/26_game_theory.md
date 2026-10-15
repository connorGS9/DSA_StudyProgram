---
title: Game Theory
order: 26
category: games
---
# Game Theory

## Recognize it

- Two players alternate, both play **optimally**, "who wins?" or "what's the final score?".
- Impartial game (both players have the same moves) → win/lose states, Nim, Sprague–Grundy.
- Score games ("maximize your total minus opponent's") → minimax DP on the score **difference**.

## Win/lose states

A position is **winning** if there's a move to a losing position; **losing** if every move leads to a winning position (or there's no move, under normal play).

```java
// Stick Game (CSES): remove p_i sticks from a heap of size x; win[x]
boolean[] win = new boolean[n + 1];             // win[0] = false: no move = lose
for (int x = 1; x <= n; x++)
    for (int p : moves) if (p <= x && !win[x - p]) { win[x] = true; break; }
```

**Find the pattern**: compute win/lose for small sizes by brute force, then look for periodicity (e.g., losing iff n % 4 == 0 for "take 1–3").

## Nim

Heaps a₁…aₖ, take any positive number from one heap. The first player wins iff `a₁ ^ a₂ ^ … ^ aₖ != 0`. Winning move: pick a heap where `aᵢ ^ X < aᵢ` and reduce it to `aᵢ ^ X`.

Variants:
- **Misère Nim** (taking the last loses): same as Nim unless all heaps are ≤ 1, in which case the result is flipped (win iff an even number of heaps of size 1).
- **Nim with at most k per move**: use heap sizes mod (k+1).
- **Staircase Nim** (Stair Game, CSES): only odd-indexed stairs matter, so XOR those.

## Sprague–Grundy theorem

Every impartial game position has a Grundy number `g = mex{ g(next) }` (mex = smallest non-negative integer not in the set). Losing ⇔ g = 0. A **sum of independent games** has Grundy number = XOR of the parts.

```java
int[] grundy = new int[N + 1];
for (int x = 1; x <= N; x++) {
    boolean[] seen = new boolean[MAXG];
    for (int p : moves) if (p <= x) seen[grundy[x - p]] = true;
    int g = 0; while (seen[g]) g++;
    grundy[x] = g;
}
```

- Splitting a heap into two unequal heaps (Grundy's Game): the next state's value is `g(a) ^ g(b)`. For large n, Grundy values become non-zero after some point; check with brute force.
- Moves on a grid / graph: Grundy number per position via DP on a DAG.

## Score games (minimax)

`dp[l][r]` = best (my score − opponent's score) on the remaining segment:

```java
// Removal Game: take from either end
for (int l = n - 1; l >= 0; l--)
    for (int r = l; r < n; r++)
        dp[l][r] = (l == r) ? a[l] : Math.max(a[l] - dp[l + 1][r], a[r] - dp[l][r - 1]);
// first player's score = (total + dp[0][n-1]) / 2
```

Same shape: Stone Game (LeetCode), Predict the Winner, Nim-like take-from-front games with a choice of 1–3 items.

## Strategy tricks

- **Symmetry / mirroring**: the second player copies the first player's move across a center (coins around a table, symmetric boards).
- **Pairing strategy**: group moves into pairs so the responder always has a reply.
- **Parity arguments**: the total number of moves is fixed, so only parity decides the winner.
- **Strategy stealing**: the first player can't lose in some symmetric games (e.g., Chomp: the first player wins).

## Pitfalls

- Normal play (last move wins) vs misère (last move loses).
- Overcomplicating: many CF game problems reduce to parity or a one-line observation. Brute force tiny cases first.

## Classic problems

- LeetCode: Nim Game, Stone Game I–IV, Predict the Winner, Can I Win (bitmask), Cat and Mouse.
- CSES: Stick Game, Nim Game I/II, Stair Game, Grundy's Game, Another Game, Removal Game.
- Codeforces tag: `games`.
