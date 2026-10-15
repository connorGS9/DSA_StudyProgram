---
title: Combinatorics & Probability
order: 21
category: combinatorics
---
# Combinatorics & Probability

## Recognize it

- "Count the number of ways / arrangements / sequences", answer mod a prime, n large (≥ 10⁵) so DP over values is too slow.
- Expected value, probability of an event.
- Symmetry: counting objects "up to rotation".

## Factorials and nCr mod p

```java
static final int MOD = 1_000_000_007;
long[] fact, invFact;
void precompute(int n) {
    fact = new long[n + 1]; invFact = new long[n + 1];
    fact[0] = 1;
    for (int i = 1; i <= n; i++) fact[i] = fact[i - 1] * i % MOD;
    invFact[n] = power(fact[n], MOD - 2);
    for (int i = n; i > 0; i--) invFact[i - 1] = invFact[i] * i % MOD;
}
long nCr(int n, int r) {
    if (r < 0 || r > n) return 0;
    return fact[n] * invFact[r] % MOD * invFact[n - r] % MOD;
}
```

Small n (≤ 1000) without a prime modulus: Pascal's triangle `C[n][k] = C[n-1][k-1] + C[n-1][k]`.

## Counting toolbox

| Situation | Count |
|---|---|
| order matters, no repetition (k of n) | n! / (n−k)! |
| subsets of size k | C(n, k) |
| arrangements of a multiset | n! / (c₁! c₂! … ) (Creating Strings II) |
| distribute n identical items into k boxes (≥ 0 each) | **stars and bars** C(n+k−1, k−1) |
| … each box ≥ 1 | C(n−1, k−1) |
| lattice paths from (0,0) to (a,b) | C(a+b, a) |
| paths avoiding obstacles | sort obstacles, `dp[i] = paths(start→i) − Σ dp[j]·paths(j→i)` |
| balanced bracket sequences of length 2n | Catalan Cₙ = C(2n, n) / (n+1) |
| derangements | D(n) = (n−1)(D(n−1) + D(n−2)) (Christmas Party) |
| surjections / set partitions | Stirling numbers of the 2nd kind |

## Inclusion–exclusion

|A ∪ B ∪ C| = Σ|A| − Σ|A∩B| + |A∩B∩C|. Iterate subsets of "bad" conditions with sign (−1)^|S|.

Typical uses: count numbers ≤ n divisible by at least one of k primes (CSES Prime Multiples), count coprime pairs, surjections `Σ (−1)ⁱ C(k,i) (k−i)ⁿ`.

## Catalan numbers

1, 1, 2, 5, 14, 42, …: balanced parentheses, full binary trees with n+1 leaves, triangulations, non-crossing handshakes, Dyck paths. Bracket Sequences II (CSES, with a fixed prefix) uses the **reflection principle**: bad paths ↔ paths to a reflected endpoint.

## Burnside's lemma (counting up to symmetry)

Number of distinct objects = average number of colorings fixed by each symmetry. Necklaces with n beads, m colors under rotation: `(1/n) Σ_{i=0..n-1} m^gcd(i, n)`.

## Probability & expected value

- **Linearity of expectation**: E[X₁ + … + Xₙ] = Σ E[Xᵢ], even if dependent. Express the quantity as a sum of indicator variables: E = Σ P(event i).
  - Expected number of inversions in a random permutation of n = C(n,2)/2.
  - Expected number of fixed points = 1.
- Geometric distribution: expected tries until success with probability p = 1/p. Coupon collector: n·Hₙ.
- E[max] trick: P(max ≤ k) = ∏ P(Xᵢ ≤ k), so P(max = k) = P(max ≤ k) − P(max ≤ k−1) (CSES Candy Lottery).
- Probability DP: `dp[step][state]` multiplied by transition probabilities (Moving Robots, Dice Probability).
- Modular probabilities: p/q mod MOD = p · q⁻¹.

## Pitfalls

- Precompute factorials up to the **largest n you'll need** (e.g., n + k for stars and bars).
- `nCr` with r > n must return 0.
- Floating-point outputs: print enough digits (`String.format("%.6f", x)`), and watch accumulated error.

## Classic problems

- LeetCode: Unique Paths (as nCr), Count Sorted Vowel Strings, Number of Music Playlists, Count Ways to Build Rooms, Soup Servings.
- CSES: Binomial Coefficients, Creating Strings II, Distributing Apples, Christmas Party, Bracket Sequences I/II, Counting Necklaces, Counting Grids, Dice Probability, Moving Robots, Candy Lottery, Inversion Probability.
