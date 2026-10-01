import assert from "node:assert/strict";
import {
  snapGeometry,
  resolveDrawingPoint,
  intersection,
  objectSnapCandidates,
} from "../src/utils/markupSnaps.js";
const items = [
  { type: "line", x: 17, y: 23, x2: 117, y2: 23 },
  { type: "line", x: 67, y: 0, x2: 67, y2: 80 },
  { type: "bay", x: 200, y: 100, length: 2.4, depth: 1.2, rotation: 90 },
];
const geometry = snapGeometry(items, 100);
const resolve = (raw, modes, extras = {}) =>
  resolveDrawingPoint(raw, {
    geometry,
    modes,
    tolerance: 10,
    gridStep: 10,
    ...extras,
  });
assert.equal(
  resolve({ x: 19, y: 25 }, ["endpoint"]).x,
  17,
  "object snap must beat grid rounding",
);
assert.equal(resolve({ x: 64, y: 25 }, ["midpoint"]).x, 67);
assert.equal(resolve({ x: 69, y: 20 }, ["intersection"]).y, 23);
assert.equal(
  resolve({ x: 42, y: 25 }, ["perpendicular"], { anchor: { x: 40, y: 70 } }).x,
  40,
);
assert.equal(resolve({ x: 42, y: 25 }, ["nearest"]).y, 23);
assert.equal(
  resolve({ x: 259, y: 219 }, ["geometricCenter"]).x,
  260,
  "rotated bay center",
);
assert.equal(resolve({ x: 201, y: 102 }, ["insertion"]).x, 200);
assert.equal(resolve({ x: 19, y: 25 }, [], { gridStep: 0 }).x, 19);
assert.equal(
  resolve({ x: 81, y: 68 }, [], { anchor: { x: 20, y: 23 }, ortho: true }).y,
  23,
);
assert.equal(
  resolve({ x: 100, y: 100 }, ["endpoint"], { tolerance: 2 }).mode,
  null,
);
assert.equal(
  intersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 2, y: -1 }),
  null,
  "no extended intersections",
);
assert.ok(
  objectSnapCandidates(
    { x: 67, y: 23 },
    geometry,
    ["midpoint", "intersection"],
    10,
  ).length >= 2,
);
console.log("Object snap geometry tests passed.");
