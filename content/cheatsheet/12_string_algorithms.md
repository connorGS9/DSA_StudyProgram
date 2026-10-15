---
title: String Algorithms
order: 12
category: string_algos
---
# String Algorithms

## Recognize it

| Task | Tool |
|---|---|
| find all occurrences of pattern p in text t | KMP / Z-function / rolling hash |
| shortest period, borders, "longest prefix that is also suffix" | prefix function (KMP) |
| compare substrings fast, many queries | polynomial rolling hash |
| prefix queries over a dictionary of words, autocomplete | trie |
| max XOR of two numbers | binary trie |
| all palindromic substrings in O(n) | Manacher |
| number of distinct substrings, LCP of suffixes | suffix array + LCP (or hashing + binary search) |

## Prefix function (KMP)

`pi[i]` = length of the longest proper prefix of `s[0..i]` that is also a suffix of it.

```java
int[] prefixFunction(String s) {
    int n = s.length();
    int[] pi = new int[n];
    for (int i = 1; i < n; i++) {
        int k = pi[i - 1];
        while (k > 0 && s.charAt(i) != s.charAt(k)) k = pi[k - 1];
        if (s.charAt(i) == s.charAt(k)) k++;
        pi[i] = k;
    }
    return pi;
}
// Occurrences of p in t: compute pi on p + '#' + t; every position with pi == |p| is a match.
```

- Shortest period of s: `n - pi[n-1]` (s is a full repetition iff n % that == 0).
- All borders: follow `pi[n-1], pi[pi[n-1]-1], …`.

## Z-function

`z[i]` = length of the longest common prefix of `s` and `s[i..]`.

```java
int[] zFunction(String s) {
    int n = s.length();
    int[] z = new int[n];
    for (int i = 1, l = 0, r = 0; i < n; i++) {
        if (i < r) z[i] = Math.min(r - i, z[i - l]);
        while (i + z[i] < n && s.charAt(z[i]) == s.charAt(i + z[i])) z[i]++;
        if (i + z[i] > r) { l = i; r = i + z[i]; }
    }
    return z;
}
```

## Rolling hash

```java
// Double-mod hashing for safety against collisions/anti-hash tests
static final long M1 = 1_000_000_007L, M2 = 998_244_353L, B = 131;
long[] h1, h2, p1, p2;
void build(String s) {
    int n = s.length();
    h1 = new long[n + 1]; h2 = new long[n + 1]; p1 = new long[n + 1]; p2 = new long[n + 1];
    p1[0] = p2[0] = 1;
    for (int i = 0; i < n; i++) {
        h1[i + 1] = (h1[i] * B + s.charAt(i)) % M1;
        h2[i + 1] = (h2[i] * B + s.charAt(i)) % M2;
        p1[i + 1] = p1[i] * B % M1;
        p2[i + 1] = p2[i] * B % M2;
    }
}
long get(int l, int r) {           // hash of s[l, r)
    long a = ((h1[r] - h1[l] * p1[r - l]) % M1 + M1) % M1;
    long b = ((h2[r] - h2[l] * p2[r - l]) % M2 + M2) % M2;
    return a * M2 + b;             // fits in long (~10^18)
}
```

Uses: substring equality in O(1), longest duplicate substring (binary search length + hash set), palindrome checks with forward + reverse hashes, LCP of two suffixes by binary search.

## Trie

```java
int[][] next = new int[MAXNODES][26];
int[] endCount = new int[MAXNODES];
int nodes = 1;                       // node 0 = root
void insert(String w) {
    int cur = 0;
    for (char c : w.toCharArray()) {
        int k = c - 'a';
        if (next[cur][k] == 0) next[cur][k] = nodes++;
        cur = next[cur][k];
    }
    endCount[cur]++;
}
```

- Word Break / Word Search II: walk the trie while walking the string/grid; prune when no child.
- **Binary trie for max XOR**: insert numbers bit by bit from bit 30 down; for a query, greedily go to the opposite bit when it exists.

## Manacher (all palindromes in O(n))

```java
// d1[i]: number of odd palindromes centered at i (radius incl. center)
int[] manacherOdd(String s) {
    int n = s.length();
    int[] d1 = new int[n];
    for (int i = 0, l = 0, r = -1; i < n; i++) {
        int k = (i > r) ? 1 : Math.min(d1[l + r - i], r - i + 1);
        while (i - k >= 0 && i + k < n && s.charAt(i - k) == s.charAt(i + k)) k++;
        d1[i] = k--;
        if (i + k > r) { l = i - k; r = i + k; }
    }
    return d1;
}
// Even palindromes: run on s with '#' inserted between characters.
```

## Suffix array (O(n log n) by doubling)

Sort suffixes by first 2ᵏ characters using ranks of pairs. With the LCP array (Kasai), distinct substrings = n(n+1)/2 − ΣLCP. In contests a hashing + binary-search approach is often enough.

## Pitfalls

- Single-mod hashing with a fixed base can be hacked on Codeforces: use two mods or a random base.
- Negative values after subtraction in hashing: add the mod back.
- Trie memory: total characters × alphabet size ints. Size the array from the constraints.

## Classic problems

- LeetCode: Find the Index of the First Occurrence (strStr), Repeated Substring Pattern, Shortest Palindrome, Implement Trie, Word Search II, Longest Duplicate Substring, Maximum XOR of Two Numbers.
- CSES: String Matching, Finding Borders, Finding Periods, Minimal Rotation, Longest Palindrome, Distinct Substrings, Word Combinations.
