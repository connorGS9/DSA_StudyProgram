---
title: Two Pointers & Sliding Window
order: 3
category: two_pointers
---
# Two Pointers & Sliding Window

## Recognize it

- Sorted array + find pair/triplet with a target sum → **opposite-end pointers**.
- "Longest/shortest **contiguous** subarray/substring such that…" → **sliding window**.
- The constraint is **monotone**: if a window is valid, every smaller (or larger) window inside it is too. That monotonicity is what makes the window technique correct.
- Merge two sorted lists, remove duplicates in place, partition → **same-direction pointers**.

## Opposite ends (sorted input)

```java
// Count pairs with a[i] + a[j] <= k, array sorted
long countPairs(int[] a, int k) {
    int i = 0, j = a.length - 1;
    long cnt = 0;
    while (i < j) {
        if (a[i] + a[j] <= k) { cnt += j - i; i++; }   // all (i, i+1..j) work
        else j--;
    }
    return cnt;
}
```

- **3Sum**: sort, fix i, two-pointer on the rest; skip duplicates for unique triplets. O(n²).
- **Container With Most Water**: always move the shorter wall (moving the taller one can't help).

## Variable-size window: longest valid

```java
// Longest substring with at most K distinct characters
int longestAtMostK(String s, int k) {
    int[] cnt = new int[128];
    int distinct = 0, best = 0;
    for (int l = 0, r = 0; r < s.length(); r++) {
        if (cnt[s.charAt(r)]++ == 0) distinct++;
        while (distinct > k) {                 // shrink until valid again
            if (--cnt[s.charAt(l++)] == 0) distinct--;
        }
        best = Math.max(best, r - l + 1);      // window [l, r] is valid
    }
    return best;
}
```

## Variable-size window: shortest valid

```java
// Minimum length subarray with sum >= target (all positive)
int minLen(int[] a, int target) {
    int best = Integer.MAX_VALUE; long sum = 0;
    for (int l = 0, r = 0; r < a.length; r++) {
        sum += a[r];
        while (sum >= target) {                // valid: record, then try to shrink
            best = Math.min(best, r - l + 1);
            sum -= a[l++];
        }
    }
    return best == Integer.MAX_VALUE ? 0 : best;
}
```

## "Exactly K" = atMost(K) − atMost(K−1)

Counting subarrays with **exactly** K distinct values (or K odd numbers…) isn't monotone, but "at most K" is. For each r, the number of valid subarrays ending at r is `r - l + 1`.

```java
long atMost(int[] a, int k) {
    Map<Integer, Integer> cnt = new HashMap<>();
    long res = 0;
    for (int l = 0, r = 0; r < a.length; r++) {
        if (cnt.merge(a[r], 1, Integer::sum) == 1) k--;
        while (k < 0) {
            if (cnt.merge(a[l], -1, Integer::sum) == 0) { cnt.remove(a[l]); k++; }
            l++;
        }
        res += r - l + 1;
    }
    return res;
}
// exactly(k) = atMost(a, k) - atMost(a, k - 1)
```

## Fixed-size window

Add `a[r]`, remove `a[r - k]` once `r >= k`. Use for max-sum of size k, anagram occurrences (compare 26-count arrays, or track the number of matching letters).

## Fast & slow pointers

- Cycle detection (Floyd): slow += 1, fast += 2. Meeting point → reset one pointer to the start and move both by 1 to find the cycle entry.
- Works on implicit linked lists too: "Find the Duplicate Number" (`i → a[i]`), "Happy Number".

## Pitfalls

- Sliding window with **negative numbers** breaks monotonicity; use prefix sums + hashmap / deque instead.
- Update the answer at the right moment (after shrinking for "longest", before shrinking for "shortest").
- Use `long` for window sums.

## Classic problems

- LeetCode: 3Sum, Container With Most Water, Longest Substring Without Repeating Characters, Minimum Window Substring, Longest Repeating Character Replacement, Subarrays with K Different Integers, Trapping Rain Water.
- CSES: Sum of Two Values, Sum of Three Values, Playlist, Distinct Values Subarrays, Apartments, Ferris Wheel.
- Codeforces tag: `two pointers`.
