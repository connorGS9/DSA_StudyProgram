---
title: Linked Lists
order: 8
category: linked_list
---
# Linked Lists

## Recognize it

Mostly a LeetCode/interview topic: pointer manipulation without extra memory. Key tools: **dummy head**, **fast/slow pointers**, **in-place reversal**.

```java
class ListNode { int val; ListNode next; ListNode(int v) { val = v; } }
```

## Reverse a list (iterative)

```java
ListNode reverse(ListNode head) {
    ListNode prev = null, cur = head;
    while (cur != null) {
        ListNode nxt = cur.next;
        cur.next = prev;
        prev = cur;
        cur = nxt;
    }
    return prev;
}
```

Reverse a sublist [m, n]: walk to node m−1, then repeatedly move the next node to the front of the sublist.

## Dummy head

Removes special cases when the head might change (deletions, merges, partitions):

```java
ListNode mergeTwo(ListNode a, ListNode b) {
    ListNode dummy = new ListNode(0), tail = dummy;
    while (a != null && b != null) {
        if (a.val <= b.val) { tail.next = a; a = a.next; } else { tail.next = b; b = b.next; }
        tail = tail.next;
    }
    tail.next = (a != null) ? a : b;
    return dummy.next;
}
```

## Fast & slow pointers

- **Middle**: when fast reaches the end, slow is at the middle.
- **Cycle detection + start of cycle** (Floyd): after meeting, move one pointer to head; advance both by 1 until they meet at the cycle entry.
- **N-th from end**: move `fast` n steps ahead, then move both.
- **Palindrome list**: find middle, reverse second half, compare, (restore).

```java
ListNode cycleStart(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next; fast = fast.next.next;
        if (slow == fast) {
            slow = head;
            while (slow != fast) { slow = slow.next; fast = fast.next; }
            return slow;
        }
    }
    return null;
}
```

## Other patterns

- **Reorder list** (L0→Ln→L1→Ln−1…): middle + reverse second half + interleave.
- **Reverse in k-groups**: count k nodes, reverse them, connect, recurse/iterate.
- **Merge k sorted lists**: min-heap of heads, O(N log k).
- **Copy list with random pointer**: interleave copies (A→A'→B→B'), set randoms, split. O(1) extra space.
- **Intersection of two lists**: walk A then B and B then A; the pointers meet at the intersection (or both null).
- **LRU cache**: HashMap + doubly linked list (or `LinkedHashMap` with `accessOrder = true` and `removeEldestEntry`).
- **Josephus problem**: circular list simulation is O(nk); use a recurrence or an order-statistics tree for large n.

## Pitfalls

- Save `next` before overwriting pointers.
- Null checks: `fast != null && fast.next != null`.
- Draw the pointers on paper for 3 nodes before coding.

## Classic problems

- LeetCode: Reverse Linked List (I, II), Merge Two Sorted Lists, Linked List Cycle II, Remove Nth Node From End, Reorder List, Reverse Nodes in k-Group, Merge k Sorted Lists, Copy List with Random Pointer, LRU Cache.
- CSES: Josephus Problem I/II.
