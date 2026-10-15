---
title: Heaps & Ordered Sets
order: 9
category: heap
---
# Heaps & Ordered Sets

## Recognize it

- Repeatedly take the **smallest/largest** of a changing collection.
- "Top k", "k-th largest", "k closest", "merge k sorted".
- Scheduling: tasks with deadlines/durations, rooms, CPU; "at each time, pick the best available".
- Need **predecessor/successor** queries ("closest value ≥ x") with insertions/deletions → `TreeSet` / `TreeMap`.

## Top-k with a size-k heap

```java
// k largest: keep a MIN-heap of size k; its top is the k-th largest
int kthLargest(int[] a, int k) {
    PriorityQueue<Integer> pq = new PriorityQueue<>();
    for (int x : a) {
        pq.offer(x);
        if (pq.size() > k) pq.poll();
    }
    return pq.peek();
}
```
O(n log k). For the k smallest, use a max-heap.

## Two heaps: running median

```java
PriorityQueue<Integer> low = new PriorityQueue<>(Collections.reverseOrder()); // max-heap
PriorityQueue<Integer> high = new PriorityQueue<>();                          // min-heap
void add(int x) {
    low.offer(x);
    high.offer(low.poll());                  // move the largest of low to high
    if (high.size() > low.size()) low.offer(high.poll());
}
double median() {
    return low.size() > high.size() ? low.peek() : (low.peek() + (double) high.peek()) / 2;
}
```

Sliding-window median: two `TreeMap` multisets (or lazy deletion with heaps).

## K-way merge

Push `(value, listIndex, position)` for each list's head; pop the min, push its successor. Also: "k-th smallest in a sorted matrix", "smallest range covering k lists".

## Scheduling patterns

```java
// Meeting rooms: min rooms = max heap size of end times
int minRooms(int[][] iv) {
    Arrays.sort(iv, (a, b) -> Integer.compare(a[0], b[0]));
    PriorityQueue<Integer> ends = new PriorityQueue<>();
    for (int[] m : iv) {
        if (!ends.isEmpty() && ends.peek() <= m[0]) ends.poll();   // reuse a freed room
        ends.offer(m[1]);
    }
    return ends.size();
}
```

- **Greedy with regret**: process items in deadline order; push each into a heap; if over capacity, pop the worst one (Course Schedule III, maximize profit with deadlines).
- **Two-heap simulation**: available vs busy (servers, IPO: unlock projects by capital, take the most profitable).

## Ordered set / map (TreeSet, TreeMap)

```java
TreeSet<Integer> set = new TreeSet<>();
Integer ge = set.ceiling(x);   // smallest >= x (null if none)
Integer le = set.floor(x);     // largest <= x
Integer gt = set.higher(x), lt = set.lower(x);

// multiset with counts
TreeMap<Integer, Integer> ms = new TreeMap<>();
ms.merge(x, 1, Integer::sum);
if (ms.merge(x, -1, Integer::sum) == 0) ms.remove(x);
int largest = ms.lastKey();
```

Use cases: Concert Tickets (largest price ≤ max, then remove), Traffic Lights (insert a cut, find neighbors, track segment lengths in a second multiset), "contains duplicate within distance k and value diff t", calendar booking.

## Lazy deletion

Java's `PriorityQueue.remove(obj)` is O(n). Instead, mark items as deleted (a count map), and when they reach the top, discard them.

## Dijkstra uses a heap too

See the Shortest Paths sheet. Skip stale entries with `if (d > dist[u]) continue;`.

## Pitfalls

- Java `PriorityQueue` is a **min-heap**. For max use `Collections.reverseOrder()` or `(a, b) -> Integer.compare(b, a)`.
- Never compare with `b - a` (overflow).
- Iterating a `PriorityQueue` doesn't give sorted order.
- `TreeSet` can't hold duplicates; use a counted `TreeMap`.

## Classic problems

- LeetCode: Kth Largest Element, Top K Frequent, K Closest Points, Find Median from Data Stream, Merge k Sorted Lists, Task Scheduler, Meeting Rooms II, IPO, Course Schedule III, Sliding Window Median.
- CSES: Concert Tickets, Traffic Lights, Room Allocation, Sliding Window Median, Movie Festival II.
