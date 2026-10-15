"""Canonical categories and the mapping from each judge's tags onto them.

Each judge tags problems differently, so everything is translated into one category list. The
scheduler balances practice across these categories; the cheat sheet is organized by them too.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Category:
    key: str
    name: str
    # Higher = more specific. A problem's primary category is its most specific mapped one, so
    # "dp + greedy" counts as DP and "binary search + sortings" counts as binary search.
    specificity: int
    # Relative share of new problems this category should get once unlocked.
    weight: float
    # Mean skill rating needed before new problems in this category are scheduled.
    unlock_at: int = 0


CATEGORIES: list[Category] = [
    Category("arrays", "Arrays & Hashing", 1, 6),
    Category("two_pointers", "Two Pointers & Sliding Window", 3, 5),
    Category("prefix_sums", "Prefix Sums & Difference Arrays", 3, 3),
    Category("sorting", "Sorting & Searching", 2, 5),
    Category("binary_search", "Binary Search", 4, 5),
    Category("stack_queue", "Stacks, Queues & Monotonic Structures", 4, 4),
    Category("linked_list", "Linked Lists", 4, 1.5),
    Category("heap", "Heaps & Ordered Sets", 4, 4),
    Category("greedy", "Greedy", 2, 6),
    Category("strings", "Strings", 2, 4),
    Category("string_algos", "String Algorithms (KMP, Z, Hashing, Trie)", 6, 2.5, unlock_at=1400),
    Category("trees", "Trees", 4, 5),
    Category("graphs", "Graph Traversal (BFS/DFS/Topo)", 4, 6),
    Category("shortest_paths", "Shortest Paths & MST", 6, 4, unlock_at=1250),
    Category("dsu", "Union-Find (DSU)", 6, 3, unlock_at=1250),
    Category("dp", "Dynamic Programming", 5, 9),
    Category("backtracking", "Backtracking & Recursion", 3, 3),
    Category("bits", "Bit Manipulation", 3, 3),
    Category("math", "Math & Number Theory", 2, 5),
    Category("combinatorics", "Combinatorics & Probability", 4, 3, unlock_at=1300),
    Category("range_queries", "Range Queries (Segment Tree, Fenwick)", 7, 4, unlock_at=1400),
    Category("advanced_graphs", "Advanced Graphs (Flows, SCC, Bridges)", 8, 2, unlock_at=1650),
    Category("advanced", "Advanced Techniques (CHT, D&C, FFT)", 8, 1.5, unlock_at=1800),
    Category("geometry", "Geometry", 6, 1, unlock_at=1500),
    Category("games", "Game Theory", 5, 1, unlock_at=1400),
    Category("constructive", "Constructive & Implementation", 1, 4),
    Category("mixed", "Mixed / Unclassified", 0, 2),
]

BY_KEY: dict[str, Category] = {c.key: c for c in CATEGORIES}

# Sentinel: problems carrying any of these tags are imported but never scheduled.
EXCLUDE = "__exclude__"

CODEFORCES_TAGS: dict[str, str | None] = {
    "greedy": "greedy",
    "math": "math",
    "implementation": "constructive",
    "dp": "dp",
    "constructive algorithms": "constructive",
    "data structures": None,  # resolved by rating below; too broad to map directly
    "brute force": "arrays",
    "binary search": "binary_search",
    "sortings": "sorting",
    "graphs": "graphs",
    "dfs and similar": "graphs",
    "trees": "trees",
    "number theory": "math",
    "combinatorics": "combinatorics",
    "strings": "strings",
    "bitmasks": "bits",
    "two pointers": "two_pointers",
    "*special": EXCLUDE,
    "geometry": "geometry",
    "dsu": "dsu",
    "divide and conquer": "advanced",
    "interactive": "constructive",
    "games": "games",
    "shortest paths": "shortest_paths",
    "probabilities": "combinatorics",
    "hashing": "string_algos",
    "flows": "advanced_graphs",
    "matrices": "math",
    "fft": "advanced",
    "graph matchings": "advanced_graphs",
    "string suffix structures": "string_algos",
    "ternary search": "binary_search",
    "meet-in-the-middle": "advanced",
    "2-sat": "advanced_graphs",
    "expression parsing": "strings",
    "chinese remainder theorem": "math",
    "schedules": "greedy",
    "communication": "constructive",
}

LEETCODE_TAGS: dict[str, str | None] = {
    "array": "arrays",
    "hash-table": "arrays",
    "matrix": "arrays",
    "counting": "arrays",
    "enumeration": "arrays",
    "string": "strings",
    "dynamic-programming": "dp",
    "memoization": "dp",
    "math": "math",
    "number-theory": "math",
    "brainteaser": "math",
    "sorting": "sorting",
    "merge-sort": "sorting",
    "quickselect": "sorting",
    "counting-sort": "sorting",
    "bucket-sort": "sorting",
    "radix-sort": "sorting",
    "line-sweep": "sorting",
    "greedy": "greedy",
    "depth-first-search": "graphs",
    "breadth-first-search": "graphs",
    "graph": "graphs",
    "topological-sort": "graphs",
    "tree": "trees",
    "binary-tree": "trees",
    "binary-search-tree": "trees",
    "binary-search": "binary_search",
    "bit-manipulation": "bits",
    "bitmask": "bits",
    "two-pointers": "two_pointers",
    "sliding-window": "two_pointers",
    "prefix-sum": "prefix_sums",
    "heap-priority-queue": "heap",
    "ordered-set": "heap",
    "data-stream": "heap",
    "stack": "stack_queue",
    "monotonic-stack": "stack_queue",
    "queue": "stack_queue",
    "monotonic-queue": "stack_queue",
    "simulation": "constructive",
    "interactive": "constructive",
    "backtracking": "backtracking",
    "recursion": "backtracking",
    "union-find": "dsu",
    "linked-list": "linked_list",
    "doubly-linked-list": "linked_list",
    "trie": "string_algos",
    "string-matching": "string_algos",
    "rolling-hash": "string_algos",
    "hash-function": "string_algos",
    "suffix-array": "string_algos",
    "segment-tree": "range_queries",
    "binary-indexed-tree": "range_queries",
    "geometry": "geometry",
    "combinatorics": "combinatorics",
    "probability-and-statistics": "combinatorics",
    "reservoir-sampling": "combinatorics",
    "rejection-sampling": "combinatorics",
    "shortest-path": "shortest_paths",
    "minimum-spanning-tree": "shortest_paths",
    "game-theory": "games",
    "strongly-connected-component": "advanced_graphs",
    "biconnected-component": "advanced_graphs",
    "eulerian-circuit": "advanced_graphs",
    "divide-and-conquer": None,
    "design": None,
    "iterator": None,
    "randomized": None,
    "database": EXCLUDE,
    "shell": EXCLUDE,
    "concurrency": EXCLUDE,
}

CSES_SECTIONS: dict[str, str] = {
    "Introductory Problems": "constructive",
    "Sorting and Searching": "sorting",
    "Dynamic Programming": "dp",
    "Graph Algorithms": "graphs",
    "Range Queries": "range_queries",
    "Tree Algorithms": "trees",
    "Mathematics": "math",
    "String Algorithms": "string_algos",
    "Geometry": "geometry",
    "Advanced Techniques": "advanced",
    "Sliding Window Problems": "two_pointers",
    "Interactive Problems": "constructive",
    "Bitwise Operations": "bits",
    "Construction Problems": "constructive",
    "Advanced Graph Problems": "advanced_graphs",
    "Counting Problems": "combinatorics",
    "Additional Problems I": "mixed",
    "Additional Problems II": "mixed",
}

# CSES sections are coarse; these titles are refined to a more specific category.
CSES_TITLE_OVERRIDES: dict[str, str] = {
    # Graph Algorithms
    "Shortest Routes I": "shortest_paths",
    "Shortest Routes II": "shortest_paths",
    "High Score": "shortest_paths",
    "Flight Discount": "shortest_paths",
    "Cycle Finding": "shortest_paths",
    "Flight Routes": "shortest_paths",
    "Investigation": "shortest_paths",
    "Road Reparation": "shortest_paths",
    "Road Construction": "dsu",
    "Planets and Kingdoms": "advanced_graphs",
    "Giant Pizza": "advanced_graphs",
    "Coin Collector": "advanced_graphs",
    "Mail Delivery": "advanced_graphs",
    "De Bruijn Sequence": "advanced_graphs",
    "Teleporters Path": "advanced_graphs",
    "Hamiltonian Flights": "dp",
    "Knight's Tour": "backtracking",
    "Download Speed": "advanced_graphs",
    "Police Chase": "advanced_graphs",
    "School Dance": "advanced_graphs",
    "Distinct Routes": "advanced_graphs",
    # Mathematics
    "Binomial Coefficients": "combinatorics",
    "Creating Strings II": "combinatorics",
    "Distributing Apples": "combinatorics",
    "Christmas Party": "combinatorics",
    "Bracket Sequences I": "combinatorics",
    "Bracket Sequences II": "combinatorics",
    "Counting Necklaces": "combinatorics",
    "Counting Grids": "combinatorics",
    "Dice Probability": "combinatorics",
    "Moving Robots": "combinatorics",
    "Candy Lottery": "combinatorics",
    "Inversion Probability": "combinatorics",
    "Stick Game": "games",
    "Nim Game I": "games",
    "Nim Game II": "games",
    "Stair Game": "games",
    "Grundy's Game": "games",
    "Another Game": "games",
    # Sorting and Searching
    "Sum of Two Values": "two_pointers",
    "Sum of Three Values": "two_pointers",
    "Sum of Four Values": "two_pointers",
    "Maximum Subarray Sum": "prefix_sums",
    "Maximum Subarray Sum II": "prefix_sums",
    "Subarray Sums I": "prefix_sums",
    "Subarray Sums II": "prefix_sums",
    "Subarray Divisibility": "prefix_sums",
    "Factory Machines": "binary_search",
    "Array Division": "binary_search",
    "Nearest Smaller Values": "stack_queue",
    "Concert Tickets": "heap",
    "Traffic Lights": "heap",
    "Room Allocation": "heap",
    "Sliding Window Median": "heap",
    "Sliding Window Cost": "heap",
    "Playlist": "two_pointers",
    "Distinct Values Subarrays": "two_pointers",
    "Distinct Values Subarrays II": "two_pointers",
    "Nested Ranges Check": "sorting",
    "Josephus Problem II": "range_queries",
    "Tasks and Deadlines": "greedy",
    "Movie Festival": "greedy",
    "Movie Festival II": "greedy",
    "Stick Lengths": "greedy",
    "Josephus Problem I": "linked_list",
    # Introductory
    "Missing Number": "arrays",
    "Repetitions": "strings",
    "Increasing Array": "greedy",
    "Number Spiral": "math",
    "Bit Strings": "math",
    "Palindrome Reorder": "strings",
    "String Reorder": "strings",
    "Knight Moves Grid": "graphs",
    "Distinct Numbers": "sorting",
    "Creating Strings": "backtracking",
    "Apple Division": "backtracking",
    "Chessboard and Queens": "backtracking",
    "Grid Path Description": "backtracking",
    "Gray Code": "bits",
    "Tower of Hanoi": "backtracking",
    "Two Knights": "combinatorics",
    "Trailing Zeros": "math",
    "Coin Piles": "math",
    "Digit Queries": "math",
}


def map_tags(tags: list[str], table: dict[str, str | None]) -> tuple[list[str], bool]:
    """Return (category keys, excluded) for a list of raw tags."""
    cats: list[str] = []
    excluded = False
    for t in tags:
        c = table.get(t)
        if c == EXCLUDE:
            excluded = True
        elif c and c not in cats:
            cats.append(c)
    return cats, excluded


def primary(cats: list[str]) -> str | None:
    if not cats:
        return None
    return max(cats, key=lambda k: BY_KEY[k].specificity)
