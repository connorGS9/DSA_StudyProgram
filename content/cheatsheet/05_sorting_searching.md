---
title: Sorting & Searching
order: 5
category: sorting
---
# Sorting & Searching

## Recognize it

- Order doesn't matter in the input → **sort first** and new structure appears (two pointers, greedy, binary search).
- Intervals / events in time → sort by start or end, then **sweep**.
- "K-th smallest", "median" → quickselect or heap.
- Values huge but few distinct → **coordinate compression**.

## Custom sorting

```java
// Sort intervals by start, ties by end descending
Arrays.sort(iv, (x, y) -> x[0] != y[0] ? Integer.compare(x[0], y[0]) : Integer.compare(y[1], x[1]));

// Largest Number: order strings by concatenation
Arrays.sort(strs, (x, y) -> (y + x).compareTo(x + y));
```

The comparator must be a **strict weak ordering** (transitive, consistent) or Java throws "Comparison method violates its general contract".

## Sweep line over events

```java
// Max number of overlapping intervals [s, e) at any time
int maxOverlap(int[][] iv) {
    int n = iv.length;
    int[][] ev = new int[2 * n][];
    for (int i = 0; i < n; i++) {
        ev[2 * i] = new int[]{iv[i][0], +1};
        ev[2 * i + 1] = new int[]{iv[i][1], -1};
    }
    // at equal times process ends (-1) before starts (+1) for half-open intervals
    Arrays.sort(ev, (a, b) -> a[0] != b[0] ? Integer.compare(a[0], b[0]) : Integer.compare(a[1], b[1]));
    int cur = 0, best = 0;
    for (int[] e : ev) { cur += e[1]; best = Math.max(best, cur); }
    return best;
}
```

## Merge intervals

Sort by start; extend the last merged interval while `next.start <= last.end`.

## Coordinate compression

```java
int[] sorted = Arrays.stream(a).distinct().sorted().toArray();
// rank of x (0-based): Arrays.binarySearch(sorted, x)
```

## Merge sort: counting inversions

```java
long sortCount(int[] a, int[] tmp, int lo, int hi) {   // sorts a[lo, hi)
    if (hi - lo < 2) return 0;
    int mid = (lo + hi) >>> 1;
    long inv = sortCount(a, tmp, lo, mid) + sortCount(a, tmp, mid, hi);
    int i = lo, j = mid, k = lo;
    while (i < mid || j < hi) {
        if (j == hi || (i < mid && a[i] <= a[j])) tmp[k++] = a[i++];
        else { inv += mid - i; tmp[k++] = a[j++]; }   // a[i..mid) all > a[j]
    }
    System.arraycopy(tmp, lo, a, lo, hi - lo);
    return inv;
}
```

The same "count across the split while merging" pattern solves Count of Smaller Numbers After Self and Reverse Pairs.

## Quickselect (k-th smallest, average O(n))

```java
int quickselect(int[] a, int k) {          // k is 0-based
    Random rnd = new Random();
    int lo = 0, hi = a.length - 1;
    while (true) {
        int p = a[lo + rnd.nextInt(hi - lo + 1)];
        int lt = lo, i = lo, gt = hi;       // 3-way partition
        while (i <= gt) {
            if (a[i] < p) swap(a, lt++, i++);
            else if (a[i] > p) swap(a, i, gt--);
            else i++;
        }
        if (k < lt) hi = lt - 1;
        else if (k > gt) lo = gt + 1;
        else return p;
    }
}
static void swap(int[] a, int i, int j) { int t = a[i]; a[i] = a[j]; a[j] = t; }
```

## Counting / bucket sort

Values in a small range → count occurrences, O(n + range). Bucket by frequency gives top-k frequent in O(n).

## Pitfalls

- `Arrays.sort(int[])` can be hacked to O(n²) on Codeforces; shuffle first.
- Sorting changes indices: keep `(value, index)` pairs if original positions matter.
- Stable sort matters for multi-key sorting when you sort in passes.

## Classic problems

- LeetCode: Merge Intervals, Meeting Rooms II, Kth Largest Element, Sort Colors, Largest Number, Count of Smaller Numbers After Self.
- CSES: Restaurant Customers, Movie Festival, Towers, Nested Ranges Check/Count, Collecting Numbers.
