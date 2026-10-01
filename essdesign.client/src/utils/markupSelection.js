import { itemSize } from "./markup.js";
export function selectionRectangle(start, end) {
  return {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
    crossing: end.x < start.x,
  };
}
let textContext;
export function objectBounds(item, scale) {
  if (item.type === "bay") {
    const { w, h } = itemSize(item, scale);
    return { left: item.x, right: item.x + w, top: item.y, bottom: item.y + h };
  }
  if (item.type === "line")
    return {
      left: Math.min(item.x, item.x2),
      right: Math.max(item.x, item.x2),
      top: Math.min(item.y, item.y2),
      bottom: Math.max(item.y, item.y2),
    };
  if (!textContext && typeof document !== "undefined")
    textContext = document.createElement("canvas").getContext("2d");
  if (textContext) {
    textContext.font = "16px Arial";
    const metrics = textContext.measureText(item.text);
    return {
      left: item.x - metrics.actualBoundingBoxLeft,
      right: item.x + metrics.actualBoundingBoxRight,
      top: item.y - metrics.actualBoundingBoxAscent,
      bottom: item.y + metrics.actualBoundingBoxDescent,
    };
  }
  return {
    left: item.x,
    right: item.x + item.text.length * 8,
    top: item.y - 16,
    bottom: item.y + 4,
  };
}
export function segmentTouchesRectangle(a, b, r) {
  // Slab clipping handles edge contact, zero-length segments and diagonal misses.
  let low = 0,
    high = 1;
  for (const [origin, delta, min, max] of [
    [a.x, b.x - a.x, r.left, r.right],
    [a.y, b.y - a.y, r.top, r.bottom],
  ]) {
    if (Math.abs(delta) < 1e-12) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const t1 = (min - origin) / delta,
      t2 = (max - origin) / delta;
    low = Math.max(low, Math.min(t1, t2));
    high = Math.min(high, Math.max(t1, t2));
    if (low > high + 1e-10) return false;
  }
  return true;
}
export function inSelectionRectangle(item, scale, r) {
  const b = objectBounds(item, scale);
  if (!r.crossing)
    return (
      b.left >= r.left &&
      b.right <= r.right &&
      b.top >= r.top &&
      b.bottom <= r.bottom
    );
  if (
    b.right < r.left ||
    b.left > r.right ||
    b.bottom < r.top ||
    b.top > r.bottom
  )
    return false;
  if (item.type === "line")
    return segmentTouchesRectangle(
      { x: item.x, y: item.y },
      { x: item.x2, y: item.y2 },
      r,
    );
  if (item.type === "note") return true;
  const corners = [
    { x: b.left, y: b.top },
    { x: b.right, y: b.top },
    { x: b.right, y: b.bottom },
    { x: b.left, y: b.bottom },
  ];
  const segments = corners.map((p, i) => [p, corners[(i + 1) % 4]]);
  segments.push([corners[0], corners[2]], [corners[1], corners[3]]);
  return segments.some(([a, b]) => segmentTouchesRectangle(a, b, r));
}
export function combineSelection(current, hits, subtract = false) {
  return subtract
    ? current.filter((id) => !hits.includes(id))
    : [...new Set([...current, ...hits])];
}
