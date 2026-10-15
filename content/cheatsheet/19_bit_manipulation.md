---
title: Bit Manipulation
order: 19
category: bits
---
# Bit Manipulation

## Recognize it

- XOR in the statement; "single number", "find the missing/duplicate", pairs cancelling.
- Subsets of a small set (n ≤ 20) → masks.
- "Maximize XOR / AND / OR" → greedy bit by bit from the highest bit, often with a binary trie.
- Constraints with powers of two, toggling, parity.

## Core operations

| Operation | Code |
|---|---|
| check bit i | `(x >> i & 1) == 1` |
| set / clear / toggle bit i | `x | (1 << i)`, `x & ~(1 << i)`, `x ^ (1 << i)` |
| lowest set bit | `x & -x` |
| clear lowest set bit | `x & (x - 1)` |
| is power of two | `x > 0 && (x & (x - 1)) == 0` |
| popcount | `Integer.bitCount(x)`, `Long.bitCount(x)` |
| index of highest bit | `31 - Integer.numberOfLeadingZeros(x)` |
| trailing zeros | `Integer.numberOfTrailingZeros(x)` |
| all n bits set | `(1 << n) - 1` (use `1L <<` for n ≥ 31) |
| iterate submasks of m | `for (int s = m; s > 0; s = (s - 1) & m)` |

## XOR tricks

- `a ^ a = 0`, `a ^ 0 = a`, commutative/associative → XOR of everything cancels pairs.
- **Single Number**: XOR all.
- **Two single numbers**: `x = a ^ b`; split by its lowest set bit; XOR each group.
- **Missing number** in 0..n: XOR of indices and values.
- **Prefix XOR**: XOR of `a[l..r] = px[r+1] ^ px[l]`; counting subarrays with XOR k uses a hashmap (like prefix sums).
- **Swap without temp**: `a ^= b; b ^= a; a ^= b;` (rarely useful, but classic).
- `a + b = (a ^ b) + 2 * (a & b)`, so `a ^ b ≤ a + b`.

## Per-bit contribution

Many sums over pairs can be computed per bit independently:

```java
// Sum of XOR over all pairs i < j
long sumPairXor(int[] a) {
    long total = 0; int n = a.length;
    for (int b = 0; b < 31; b++) {
        long ones = 0;
        for (int x : a) ones += (x >> b) & 1;
        total += ones * (n - ones) * (1L << b);   // pairs with different bit b
    }
    return total;
}
```

Same idea for sum of ANDs (pairs of ones), counting bits 1..n (pattern per bit position, CSES Counting Bits).

## Greedy from the highest bit

- **Max XOR pair**: binary trie, or the prefix-set trick: build the answer bit by bit and check with a HashSet of prefixes.
- **Max AND of a pair**: try setting each bit from high to low; keep it if ≥ 2 numbers contain all chosen bits.
- **Min XOR pair**: sort; the answer is among adjacent elements.

## Linear basis (XOR basis)

```java
long[] basis = new long[61];
boolean insert(long x) {
    for (int b = 60; b >= 0; b--) {
        if ((x >> b & 1) == 0) continue;
        if (basis[b] == 0) { basis[b] = x; return true; }
        x ^= basis[b];
    }
    return false;                    // x is representable already
}
long maxXor() {
    long r = 0;
    for (int b = 60; b >= 0; b--) r = Math.max(r, r ^ basis[b]);
    return r;
}
```

Answers "max XOR of any subset", "how many distinct subset XORs" (2^rank), "k-th smallest subset XOR".

## Bitsets for speed

`java.util.BitSet` or `long[]` words give a ~64× speed-up for subset-sum reachability (`bits |= bits << w`) and for counting common neighbors.

## Pitfalls

- `1 << 31` is negative and `1 << 32 == 1` in Java: use `1L << i` for i ≥ 31.
- `>>` keeps the sign; use `>>>` for unsigned shift.
- Operator precedence: `x & 1 == 0` parses as `x & (1 == 0)`. Parenthesize: `(x & 1) == 0`.

## Classic problems

- LeetCode: Single Number I/II/III, Number of 1 Bits, Counting Bits, Reverse Bits, Missing Number, Sum of Two Integers, Maximum XOR of Two Numbers, Subsets (bitmask), Minimum Flips to Make a OR b Equal to c.
- CSES: Gray Code, Bit Strings, Counting Bits, Maximum XOR Subarray, Hamming Distance, XOR Pyramid.
