---
title: Stacks, Queues & Monotonic Structures
order: 7
category: stack_queue
---
# Stacks, Queues & Monotonic Structures

## Recognize it

- Matching / nesting: parentheses, tags, "decode string", undo operations → **stack**.
- "Next greater / smaller element", "previous smaller", "how far can each bar extend", "stock span" → **monotonic stack**.
- "Max/min of every window of size k", or DP `dp[i] = min(dp[j]) + c` over a sliding range of j → **monotonic deque**.
- Process in arrival order, BFS levels → **queue**.

## Monotonic stack: next greater element

Keep indices whose values are **decreasing**; when a bigger value arrives, it is the "next greater" for everything it pops.

```java
int[] nextGreater(int[] a) {
    int n = a.length;
    int[] res = new int[n];
    Arrays.fill(res, -1);
    Deque<Integer> st = new ArrayDeque<>();     // indices, values decreasing
    for (int i = 0; i < n; i++) {
        while (!st.isEmpty() && a[st.peek()] < a[i]) res[st.pop()] = i;
        st.push(i);
    }
    return res;
}
```

| Want | Stack keeps | Pop while |
|---|---|---|
| next greater | decreasing | `a[top] < a[i]` |
| next smaller | increasing | `a[top] > a[i]` |
| previous smaller (for each i) | increasing; answer = top after popping | `a[top] >= a[i]` |

Circular array: iterate `2n` times using `i % n`.

## Largest rectangle in histogram

For each bar, extend left/right until a smaller bar: width = nextSmaller − prevSmaller − 1.

```java
long largestRectangle(int[] h) {
    int n = h.length; long best = 0;
    Deque<Integer> st = new ArrayDeque<>();
    for (int i = 0; i <= n; i++) {
        int cur = (i == n) ? 0 : h[i];              // sentinel flushes the stack
        while (!st.isEmpty() && h[st.peek()] >= cur) {
            int height = h[st.pop()];
            int left = st.isEmpty() ? -1 : st.peek();
            best = Math.max(best, (long) height * (i - left - 1));
        }
        st.push(i);
    }
    return best;
}
```

Maximal rectangle in a binary matrix = run this on each row's "heights" array.

## Contribution technique (sum of subarray minimums)

Each `a[i]` is the minimum of `(i - prevLess) * (nextLessOrEqual - i)` subarrays. Use strict on one side and non-strict on the other so equal values aren't double-counted.

## Monotonic deque: sliding window maximum

```java
int[] maxSlidingWindow(int[] a, int k) {
    int n = a.length;
    int[] res = new int[n - k + 1];
    Deque<Integer> dq = new ArrayDeque<>();      // indices, values decreasing
    for (int i = 0; i < n; i++) {
        while (!dq.isEmpty() && dq.peekFirst() <= i - k) dq.pollFirst();        // out of window
        while (!dq.isEmpty() && a[dq.peekLast()] <= a[i]) dq.pollLast();        // dominated
        dq.offerLast(i);
        if (i >= k - 1) res[i - k + 1] = a[dq.peekFirst()];
    }
    return res;
}
```

The same deque speeds up DP: `dp[i] = a[i] + max(dp[i-k..i-1])` (Jump Game VI, Constrained Subsequence Sum).

## Stack for parsing

- Valid parentheses: push opens, pop and match on close.
- Basic calculator: keep `result`, `sign`, push both on `(` and pop on `)`.
- Decode string `3[a2[c]]`: stack of (count, builder).
- Remove K digits / smallest subsequence of distinct chars: **greedy monotonic stack**. Pop larger previous chars while you can still afford to.

## Queue tricks

- **Queue with two stacks**: push into `in`; pop from `out`, refilling from `in` when empty (amortized O(1)).
- **Min-stack**: store `(value, minSoFar)` pairs.

## Pitfalls

- Store **indices** in the stack, not values; you usually need positions.
- Decide strict vs non-strict comparisons deliberately (duplicates!).
- `Stack<>` is legacy and synchronized; use `ArrayDeque`.

## Classic problems

- LeetCode: Valid Parentheses, Daily Temperatures, Next Greater Element II, Largest Rectangle in Histogram, Maximal Rectangle, Sliding Window Maximum, Sum of Subarray Minimums, Basic Calculator, Remove K Digits, Asteroid Collision.
- CSES: Nearest Smaller Values, Sliding Window Minimum, Advertisement.
