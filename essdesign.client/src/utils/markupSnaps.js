import { itemSize } from "./markup.js";
export const SNAP_MODES = [
  ["endpoint", "Endpoint", "□"],
  ["midpoint", "Midpoint", "△"],
  ["intersection", "Intersection", "×"],
  ["perpendicular", "Perpendicular", "⊥"],
  ["nearest", "Nearest", "⋈"],
  ["insertion", "Insertion", "⊞"],
  ["geometricCenter", "Geometric center", "◇"],
];
export function snapGeometry(items, scale) {
  const segments = [],
    insertions = [],
    centers = [];
  for (const item of items) {
    if (item.type === "line")
      segments.push([
        { x: item.x, y: item.y },
        { x: item.x2, y: item.y2 },
      ]);
    if (item.type === "bay") {
      const { w, h } = itemSize(item, scale);
      const corners = [
        { x: item.x, y: item.y },
        { x: item.x + w, y: item.y },
        { x: item.x + w, y: item.y + h },
        { x: item.x, y: item.y + h },
      ];
      for (let i = 0; i < 4; i++)
        segments.push([corners[i], corners[(i + 1) % 4]]);
      segments.push([corners[0], corners[2]], [corners[1], corners[3]]);
      centers.push({ x: item.x + w / 2, y: item.y + h / 2 });
      insertions.push(corners[0]);
    }
    if (item.type === "note") insertions.push({ x: item.x, y: item.y });
  }
  return { segments, insertions, centers };
}
export function projection(p, a, b, clamp = true) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy;
  if (length < 1e-16) return { ...a };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
  if (!clamp && (t < 0 || t > 1)) return null;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}
export function intersection(a, b, c, d) {
  const rx = b.x - a.x,
    ry = b.y - a.y,
    sx = d.x - c.x,
    sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-10) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: a.x + t * rx, y: a.y + t * ry };
}
export function objectSnapCandidates(
  raw,
  geometry,
  modes,
  tolerance,
  anchor = null,
) {
  const candidates = [];
  const add = (point, mode) => {
    if (!point) return;
    const distance = Math.hypot(raw.x - point.x, raw.y - point.y);
    if (
      distance <= tolerance &&
      !candidates.some(
        (c) =>
          c.mode === mode && Math.hypot(c.x - point.x, c.y - point.y) < 1e-7,
      )
    )
      candidates.push({ ...point, mode, distance });
  };
  const nearby = geometry.segments.filter(
    ([a, b]) =>
      raw.x >= Math.min(a.x, b.x) - tolerance &&
      raw.x <= Math.max(a.x, b.x) + tolerance &&
      raw.y >= Math.min(a.y, b.y) - tolerance &&
      raw.y <= Math.max(a.y, b.y) + tolerance,
  );
  for (const [a, b] of nearby) {
    if (modes.includes("endpoint")) {
      add(a, "endpoint");
      add(b, "endpoint");
    }
    if (modes.includes("midpoint"))
      add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, "midpoint");
    if (modes.includes("nearest")) add(projection(raw, a, b), "nearest");
    if (modes.includes("perpendicular") && anchor)
      add(projection(anchor, a, b, false), "perpendicular");
  }
  if (modes.includes("intersection"))
    for (let i = 0; i < nearby.length; i++)
      for (let j = i + 1; j < nearby.length; j++)
        add(intersection(...nearby[i], ...nearby[j]), "intersection");
  if (modes.includes("insertion"))
    geometry.insertions.forEach((p) => add(p, "insertion"));
  if (modes.includes("geometricCenter"))
    geometry.centers.forEach((p) => add(p, "geometricCenter"));
  // Precise features win over a generic nearest point. Tab can choose another eligible feature.
  return candidates.sort(
    (a, b) =>
      (a.mode === "nearest") - (b.mode === "nearest") ||
      a.distance - b.distance,
  );
}
export function resolveDrawingPoint(
  raw,
  {
    geometry,
    modes,
    tolerance,
    anchor,
    gridStep = 0,
    ortho = false,
    cycle = 0,
  },
) {
  const candidates = objectSnapCandidates(
    raw,
    geometry,
    modes,
    tolerance,
    anchor,
  );
  if (candidates.length) {
    const chosen = candidates[cycle % candidates.length];
    return { ...chosen, candidates };
  }
  let x = raw.x,
    y = raw.y;
  if (gridStep > 0) {
    x = Math.round(x / gridStep) * gridStep;
    y = Math.round(y / gridStep) * gridStep;
  }
  if (ortho && anchor) {
    if (Math.abs(raw.x - anchor.x) >= Math.abs(raw.y - anchor.y)) y = anchor.y;
    else x = anchor.x;
  }
  return { x, y, mode: null, candidates };
}
