---
title: Java Toolkit (+ Python, C++)
order: 1
---
# Java Toolkit for Competitive Programming

## Fast I/O template

`Scanner` is too slow for 10⁵+ numbers. Use this for Codeforces/CSES:

```java
import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        FastReader in = new FastReader(System.in);
        PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));
        int t = in.nextInt();
        while (t-- > 0) {
            int n = in.nextInt();
            long[] a = new long[n];
            for (int i = 0; i < n; i++) a[i] = in.nextLong();
            out.println(solve(n, a));
        }
        out.flush();   // forgetting this prints nothing
    }

    static long solve(int n, long[] a) { return 0; }

    static class FastReader {
        private final DataInputStream in;
        private final byte[] buf = new byte[1 << 16];
        private int len = 0, ptr = 0;
        FastReader(InputStream is) { in = new DataInputStream(is); }
        private int read() throws IOException {
            if (ptr == len) { len = in.read(buf, 0, buf.length); ptr = 0; if (len <= 0) return -1; }
            return buf[ptr++];
        }
        int nextInt() throws IOException { return (int) nextLong(); }
        long nextLong() throws IOException {
            int c = read();
            while (c <= ' ') c = read();
            boolean neg = c == '-';
            if (neg) c = read();
            long r = 0;
            while (c >= '0' && c <= '9') { r = r * 10 + (c - '0'); c = read(); }
            return neg ? -r : r;
        }
        String next() throws IOException {
            int c = read();
            while (c <= ' ') c = read();
            StringBuilder sb = new StringBuilder();
            while (c > ' ') { sb.append((char) c); c = read(); }
            return sb.toString();
        }
    }
}
```

## Collections cheat sheet

| Need | Java | Ops |
|---|---|---|
| dynamic array | `ArrayList<Integer>` | get/add O(1) |
| hash map / set | `HashMap`, `HashSet` | O(1) avg |
| ordered map / set | `TreeMap`, `TreeSet` | O(log n): `floorKey`, `ceilingKey`, `higher`, `lower`, `firstKey`, `pollFirst` |
| multiset | `TreeMap<Integer,Integer>` of counts | `merge(x, 1, Integer::sum)`; remove when count hits 0 |
| heap | `PriorityQueue<>` (min-heap) | max-heap: `new PriorityQueue<>(Collections.reverseOrder())` |
| deque / stack / queue | `ArrayDeque<>` | `push/pop/peek` (stack), `offer/poll` (queue), `offerFirst/pollLast` |
| string building | `StringBuilder` | `append`, `reverse`, `setCharAt` |

```java
// Count occurrences
Map<Integer, Integer> cnt = new HashMap<>();
for (int x : a) cnt.merge(x, 1, Integer::sum);

// Group by key
Map<String, List<String>> groups = new HashMap<>();
groups.computeIfAbsent(key, k -> new ArrayList<>()).add(word);

// Sort with comparator (objects only)
Integer[] idx = new Integer[n];
for (int i = 0; i < n; i++) idx[i] = i;
Arrays.sort(idx, (i, j) -> Integer.compare(a[i], a[j]));

// Sort pairs by first, then second descending
int[][] p = new int[n][2];
Arrays.sort(p, (x, y) -> x[0] != y[0] ? Integer.compare(x[0], y[0]) : Integer.compare(y[1], x[1]));

// PriorityQueue of arrays: [dist, node]
PriorityQueue<long[]> pq = new PriorityQueue<>((x, y) -> Long.compare(x[0], y[0]));
```

## Java pitfalls that cost ACs

- **`Integer == Integer` compares references** outside −128..127. Use `.equals()` or unbox to `int`.
- **`Arrays.sort(int[])` is dual-pivot quicksort**, and Codeforces hacks can make it O(n²). Shuffle first, or sort a `long[]`/`Integer[]` (merge sort), or use the helper below.
- **Comparator `a - b` overflows** for large values. Use `Integer.compare(a, b)`.
- **Overflow**: `int` max ≈ 2.1·10⁹. `a * b` with ints overflows *before* assignment to long: write `(long) a * b`.
- **Recursion depth**: the default stack is ~512 KB to 1 MB. For deep DFS (n = 2·10⁵ chain) run in a thread:
  ```java
  new Thread(null, () -> { try { solve(); } catch (Exception e) { throw new RuntimeException(e); } }, "main", 1 << 28).start();
  ```
- **String concatenation in loops** is O(n²). Use `StringBuilder`.
- **HashMap anti-hash tests** on Codeforces: rarely an issue in Java (treeified buckets), but `TreeMap` is the safe fallback.
- `Math.abs(Integer.MIN_VALUE)` is negative. `(int) Math.sqrt(x)` may be off by one, so adjust with a while loop.

```java
static void safeSort(int[] a) {
    Random r = new Random();
    for (int i = a.length - 1; i > 0; i--) { int j = r.nextInt(i + 1); int t = a[i]; a[i] = a[j]; a[j] = t; }
    Arrays.sort(a);
}
```

## Common helpers

```java
static final long MOD = 1_000_000_007L;
static long power(long b, long e, long m) {
    long r = 1; b %= m;
    while (e > 0) { if ((e & 1) == 1) r = r * b % m; b = b * b % m; e >>= 1; }
    return r;
}
static long gcd(long a, long b) { return b == 0 ? a : gcd(b, a % b); }
static int lowerBound(int[] a, int x) { // first index with a[i] >= x
    int lo = 0, hi = a.length;
    while (lo < hi) { int mid = (lo + hi) >>> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
}
```

## Python equivalents

```python
import sys, heapq, bisect
from collections import defaultdict, Counter, deque
from functools import lru_cache
input = sys.stdin.readline                 # fast input
sys.setrecursionlimit(1 << 20)             # deep recursion (still slow: prefer iterative)

heapq.heappush(h, (dist, node)); heapq.heappop(h)   # min-heap; negate for max-heap
bisect.bisect_left(a, x)  # first index with a[i] >= x
bisect.bisect_right(a, x) # first index with a[i] >  x
```
Python is ~30–50× slower than Java/C++: fine for LeetCode, risky for Codeforces above 10⁶ operations.

## C++ equivalents

```cpp
#include <bits/stdc++.h>
using namespace std;
using ll = long long;
int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);
    // vector, map/set (ordered), unordered_map, priority_queue (MAX-heap by default!)
    priority_queue<pair<ll,int>, vector<pair<ll,int>>, greater<>> pq; // min-heap
    // lower_bound(v.begin(), v.end(), x) - v.begin()
}
```
