import assert from "node:assert/strict";
import {
  referenceScale,
  itemSize,
  hitItem,
  validateProject,
} from "../src/utils/markup.js";
assert.equal(referenceScale({ x: 10, y: 20 }, { x: 310, y: 420 }, 5), 100);
assert.throws(() => referenceScale({ x: 0, y: 0 }, { x: 0, y: 0 }, 2));
assert.throws(() => referenceScale({ x: 0, y: 0 }, { x: 10, y: 0 }, 0));
assert.deepEqual(
  itemSize({ type: "bay", length: 2.4, depth: 1.2, rotation: 90 }, 100),
  { w: 120, h: 240 },
);
assert.ok(
  hitItem(
    { type: "line", x: 0, y: 0, x2: 100, y2: 100 },
    { x: 50, y: 52 },
    100,
    4,
  ),
);
assert.ok(
  !hitItem(
    { type: "line", x: 0, y: 0, x2: 100, y2: 100 },
    { x: 150, y: 150 },
    100,
    4,
  ),
);
assert.throws(() =>
  validateProject({
    version: 1,
    title: "Bad",
    sheets: [{ image: "https://example.com/image.png" }],
  }),
);
console.log("Markup geometry and input validation passed.");
