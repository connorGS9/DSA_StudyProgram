---
title: Math & Number Theory
order: 20
category: math
---
# Math & Number Theory

## Recognize it

- Divisibility, primes, gcd/lcm, remainders, "modulo 10⁹+7".
- n up to 10¹⁸ → a formula, O(√n), or O(log n).
- A process repeated a huge number of times → find a cycle or a closed form.
- First step: **brute force small cases and look for a pattern**, then prove it.

## GCD, LCM, extended Euclid

```java
long gcd(long a, long b) { while (b != 0) { long t = a % b; a = b; b = t; } return a; }
long lcm(long a, long b) { return a / gcd(a, b) * b; }       // divide first to avoid overflow

// returns g = gcd(a, b) and fills x, y with a*x + b*y = g
long[] extGcd(long a, long b) {
    if (b == 0) return new long[]{a, 1, 0};
    long[] r = extGcd(b, a % b);
    return new long[]{r[0], r[2], r[1] - (a / b) * r[2]};
}
```

- gcd of a whole array; `gcd(a, b) = gcd(a, b - a)`, so the gcd of differences is invariant under adding the same value to everything.
- Linear Diophantine `ax + by = c` is solvable iff `gcd(a, b) | c`.

## Modular arithmetic

```java
static final long MOD = 1_000_000_007L;
long add(long a, long b) { return (a + b) % MOD; }
long sub(long a, long b) { return ((a - b) % MOD + MOD) % MOD; }
long mul(long a, long b) { return a % MOD * (b % MOD) % MOD; }
long power(long b, long e) {
    long r = 1; b %= MOD; if (b < 0) b += MOD;
    while (e > 0) { if ((e & 1) == 1) r = r * b % MOD; b = b * b % MOD; e >>= 1; }
    return r;
}
long inv(long a) { return power(a, MOD - 2); }   // Fermat: MOD must be prime, a not divisible by MOD
```

- Division mod p = multiply by the inverse.
- **Exponent reduction**: `a^(b^c) mod p` = `a^(b^c mod (p−1)) mod p` when p is prime and p ∤ a (CSES Exponentiation II).
- Products of two numbers < 2⁶³ mod a ~10¹⁸ modulus need `Math.multiplyHigh` or `BigInteger` (or `__int128` in C++).

## Primes

```java
// Sieve of Eratosthenes + smallest prime factor (spf) for fast factorization
int[] spf = new int[N + 1];
for (int i = 2; i <= N; i++) if (spf[i] == 0)
    for (int j = i; j <= N; j += i) if (spf[j] == 0) spf[j] = i;
// factorize x <= N in O(log x):  while (x > 1) { int p = spf[x]; while (x % p == 0) x /= p; ... }
```

- Primality / factorization of one number up to 10¹² by trial division to √n: O(√n).
- Number of divisors from factorization `∏(eᵢ + 1)`; sum of divisors `∏ (p^(e+1) − 1)/(p − 1)`.
- Divisor counts for all numbers ≤ N: for each d, add 1 to its multiples, O(N log N).
- Euler's totient φ(n) = n ∏(1 − 1/p). `a^φ(m) ≡ 1 (mod m)` for gcd(a, m) = 1.

## Divisor-sum tricks

- Σ_{i=1..n} ⌊n/i⌋ in O(√n): group i by equal values of ⌊n/i⌋ (CSES Sum of Divisors).

```java
// sum_{i=1..n} floor(n / i) * i, mod MOD
long sumDiv(long n) {
    long res = 0;
    for (long i = 1; i <= n; ) {
        long q = n / i, j = n / q;               // all i..j share the same quotient q
        long cnt = (j - i + 1) % MOD, s = ((i + j) % MOD) * cnt % MOD * inv(2) % MOD;
        res = (res + q % MOD * s) % MOD;
        i = j + 1;
    }
    return res;
}
```

- Count pairs with gcd = g: Möbius / inclusion–exclusion over multiples (count multiples of each d, subtract the counts for multiples of d).

## Useful formulas

- 1 + 2 + … + n = n(n+1)/2; Σk² = n(n+1)(2n+1)/6.
- Geometric sum: (rⁿ⁺¹ − 1)/(r − 1) (mod p via the inverse).
- Trailing zeros of n! = Σ ⌊n/5ᵏ⌋.
- Number of digits of x = ⌊log₁₀ x⌋ + 1.
- `ceil(a / b)` for positive ints = `(a + b - 1) / b`. For possibly negative values use `Math.floorDiv`.

## Matrix exponentiation

Linear recurrences with n up to 10¹⁸ (Fibonacci, counting paths of length k in a graph = `A^k`). See the DP sheet for code.

## Number spirals, grids & closed forms

Many "Introductory" CSES problems (Number Spiral, Two Knights, Coin Piles) are about deriving a formula: count total placements, subtract the bad ones; check parity and bounds.

## Pitfalls

- Overflow: `a * b` with a, b ≤ 10⁹ needs `long`. Three such factors overflow even `long`, so reduce mod first.
- `%` of a negative in Java is negative.
- `Math.pow` returns a double, which is imprecise above 2⁵³. Use integer fast power.
- `Math.sqrt` on large longs: fix with `while (r * r > n) r--; while ((r + 1) * (r + 1) <= n) r++;`.

## Classic problems

- LeetCode: Pow(x, n), Count Primes, Ugly Number II, Happy Number, Excel Sheet Column Number, Fraction to Recurring Decimal, Water and Jug Problem.
- CSES: Exponentiation I/II, Counting Divisors, Common Divisors, Sum of Divisors, Divisor Analysis, Prime Multiples, Counting Coprime Pairs, Fibonacci Numbers, Throwing Dice, Graph Paths I.
- Codeforces tags: `math`, `number theory`.
