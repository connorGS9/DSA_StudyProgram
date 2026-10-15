---
title: Geometry
order: 25
category: geometry
---
# Computational Geometry

## Ground rules

- Use **integer arithmetic** (`long`) whenever inputs are integers. Most contest geometry is cross products, which stay exact.
- If you must use doubles, compare with an epsilon (`1e-9`) and avoid `sqrt`/`atan2` until the end.

## Vectors and the cross product

```java
// cross(O, A, B) = (A - O) x (B - O)
long cross(long ox, long oy, long ax, long ay, long bx, long by) {
    return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}
// > 0: B is to the LEFT of ray O->A (counter-clockwise turn)
// < 0: right (clockwise), == 0: collinear
long dot(long ax, long ay, long bx, long by) { return ax * bx + ay * by; }
```

- Point location relative to a line: sign of the cross product (CSES Point Location Test).
- Angle tests: dot > 0 acute, = 0 right angle, < 0 obtuse.
- Twice the triangle area = |cross|.

## Segment intersection

Segments AB and CD intersect iff
- `cross(A,B,C)` and `cross(A,B,D)` have opposite signs (or zero), **and**
- `cross(C,D,A)` and `cross(C,D,B)` have opposite signs (or zero),
- with the special case of all four being collinear: check bounding-box overlap.

```java
boolean onSegment(long px, long py, long ax, long ay, long bx, long by) {   // P collinear with AB
    return Math.min(ax, bx) <= px && px <= Math.max(ax, bx) && Math.min(ay, by) <= py && py <= Math.max(ay, by);
}
boolean intersect(long[] a, long[] b, long[] c, long[] d) {
    long d1 = Long.signum(cross(a[0], a[1], b[0], b[1], c[0], c[1]));
    long d2 = Long.signum(cross(a[0], a[1], b[0], b[1], d[0], d[1]));
    long d3 = Long.signum(cross(c[0], c[1], d[0], d[1], a[0], a[1]));
    long d4 = Long.signum(cross(c[0], c[1], d[0], d[1], b[0], b[1]));
    if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    return (d1 == 0 && onSegment(c[0], c[1], a[0], a[1], b[0], b[1]))
        || (d2 == 0 && onSegment(d[0], d[1], a[0], a[1], b[0], b[1]))
        || (d3 == 0 && onSegment(a[0], a[1], c[0], c[1], d[0], d[1]))
        || (d4 == 0 && onSegment(b[0], b[1], c[0], c[1], d[0], d[1]));
}
```

## Polygon area (shoelace)

```java
long twiceArea(long[] x, long[] y) {
    long s = 0; int n = x.length;
    for (int i = 0; i < n; i++) { int j = (i + 1) % n; s += x[i] * y[j] - x[j] * y[i]; }
    return Math.abs(s);           // area = s / 2; sign of s gives orientation (CCW positive)
}
```

## Point in polygon

Ray casting: count edges crossed by a ray to the right; odd → inside. Check "on boundary" first with the collinear + bounding-box test (CSES Point in Polygon).

## Pick's theorem

For a lattice polygon: `Area = I + B/2 − 1`, where I = interior lattice points and B = boundary points. B over an edge (dx, dy) = gcd(|dx|, |dy|) (CSES Polygon Lattice Points).

## Convex hull (Andrew's monotone chain)

```java
// points sorted by (x, y); returns hull in CCW order without collinear points
long[][] hull(long[][] p) {
    Arrays.sort(p, (a, b) -> a[0] != b[0] ? Long.compare(a[0], b[0]) : Long.compare(a[1], b[1]));
    int n = p.length, k = 0;
    if (n < 3) return p;
    long[][] h = new long[2 * n][];
    for (int i = 0; i < n; i++) {                                   // lower hull
        while (k >= 2 && cross(h[k-2][0], h[k-2][1], h[k-1][0], h[k-1][1], p[i][0], p[i][1]) <= 0) k--;
        h[k++] = p[i];
    }
    for (int i = n - 2, t = k + 1; i >= 0; i--) {                   // upper hull
        while (k >= t && cross(h[k-2][0], h[k-2][1], h[k-1][0], h[k-1][1], p[i][0], p[i][1]) <= 0) k--;
        h[k++] = p[i];
    }
    return Arrays.copyOf(h, k - 1);
}
```

Use `< 0` instead of `<= 0` to keep collinear boundary points (CSES Convex Hull asks for them).

## Other tools

- **Closest pair of points**: sort by x, divide & conquer, or a sweep with a TreeSet ordered by y. O(n log n).
- **Manhattan distance tricks**: `|x1−x2| + |y1−y2| = max over signs of (±x ± y)` differences. Rotate by 45°: `(x+y, x−y)` turns Manhattan into Chebyshev distance.
- **Sorting by angle**: split into half-planes, then compare with the cross product (no `atan2`).
- **Rotating calipers** on the hull: farthest pair (diameter), min-width.
- Lines as `ax + by = c`; intersection via Cramer's rule (doubles).

## Pitfalls

- Cross products of coordinates up to 10⁹ reach ~4·10¹⁸: still fits in `long` (max ≈ 9.2·10¹⁸), but barely. Don't add several of them without care.
- Collinear and duplicate points break naive hulls.
- Mixing up the orientation sign convention.

## Classic problems

- LeetCode: Max Points on a Line, Erect the Fence (convex hull), Valid Boomerang, Minimum Area Rectangle, Rectangle Overlap.
- CSES: Point Location Test, Line Segment Intersection, Polygon Area, Point in Polygon, Polygon Lattice Points, Minimum Euclidean Distance, Convex Hull, Maximum Manhattan Distances.
