---
title: Strings
order: 11
category: strings
---
# Strings (fundamentals)

## Recognize it

- Palindromes, anagrams, character counts, parsing, reversing words, comparing versions.
- For heavy pattern matching see **String Algorithms** (KMP, Z, hashing, trie).

## Java string basics

```java
char[] cs = s.toCharArray();             // mutate as an array
StringBuilder sb = new StringBuilder();  // append in O(1) amortized
String t = new String(cs);
int[] cnt = new int[26]; for (char c : s.toCharArray()) cnt[c - 'a']++;
s.substring(l, r);                       // O(r - l) copy, [l, r)
s.equals(t);                             // NOT ==
String.join(" ", list);
s.split("\\s+");                          // regex split
Character.isDigit(c), Character.isLetterOrDigit(c), Character.toLowerCase(c)
```

## Palindromes

- **Check**: two pointers from both ends.
- **Longest palindromic substring**: expand around each center (2n−1 centers), O(n²). For O(n) use Manacher (String Algorithms sheet).
- **Palindrome with one deletion allowed**: on first mismatch, try skipping either side.
- **Rearrange into palindrome**: at most one character with an odd count. Build half + middle + reverse(half).

```java
int expand(String s, int l, int r) {          // returns length of palindrome centered at (l, r)
    while (l >= 0 && r < s.length() && s.charAt(l) == s.charAt(r)) { l--; r++; }
    return r - l - 1;
}
```

## Anagrams & counts

- Anagram check: equal 26-count arrays.
- Find all anagrams of p in s: fixed sliding window of `|p|` with counts; track how many letters match.
- Group anagrams: key = sorted string or count signature.

## Parsing

- Tokenize manually with an index pointer for expressions; handle multi-digit numbers with `num = num * 10 + (c - '0')`.
- Compare version numbers: split on `\\.`, compare as integers, pad missing parts with 0.
- String to integer (atoi): skip spaces, sign, digits, clamp on overflow (check before multiplying).

## Subsequence checks

- `isSubsequence(s, t)`: one pointer in s advanced when it matches t's character.
- Many queries: precompute `next[i][c]` = next position of c at or after i, so each query is O(|s|).

## Counting substrings

- Number of substrings = n(n+1)/2. Substrings with all equal characters: sum over runs of len(len+1)/2.
- Substrings with some property often use sliding windows or prefix counts.

## Pitfalls

- `s1 == s2` compares references. Always use `.equals`.
- `+=` on Strings inside loops is O(n²).
- `charAt` on a huge String in a hot loop: convert to `char[]` first.
- Unicode/uppercase: check if input can have uppercase or digits before using `c - 'a'`.

## Classic problems

- LeetCode: Valid Anagram, Valid Palindrome (I, II), Longest Palindromic Substring, Palindromic Substrings, Find All Anagrams in a String, String Compression, Reverse Words in a String, Longest Common Prefix.
- CSES: Repetitions, Palindrome Reorder, Creating Strings.
