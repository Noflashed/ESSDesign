import assert from "node:assert/strict";
import {
  selectionRectangle,
  inSelectionRectangle,
  segmentTouchesRectangle,
  combineSelection,
} from "../src/utils/markupSelection.js";
const line = { type: "line", x: 100, y: 100, x2: 300, y2: 300 };
assert.equal(
  inSelectionRectangle(
    line,
    100,
    selectionRectangle({ x: 90, y: 90 }, { x: 310, y: 310 }),
  ),
  true,
);
assert.equal(
  inSelectionRectangle(
    line,
    100,
    selectionRectangle({ x: 90, y: 90 }, { x: 200, y: 200 }),
  ),
  false,
);
assert.equal(
  inSelectionRectangle(
    line,
    100,
    selectionRectangle({ x: 200, y: 200 }, { x: 90, y: 90 }),
  ),
  true,
);
assert.equal(
  inSelectionRectangle(
    line,
    100,
    selectionRectangle({ x: 150, y: 300 }, { x: 90, y: 250 }),
  ),
  false,
  "diagonal bounding-box overlap is not an intersection",
);
assert.equal(
  segmentTouchesRectangle(
    { x: 0, y: 20 },
    { x: 100, y: 20 },
    { left: 10, right: 30, top: 20, bottom: 40 },
  ),
  true,
  "touching boundary is crossing",
);
const bay = {
  type: "bay",
  x: 100,
  y: 100,
  length: 2.4,
  depth: 1.2,
  rotation: 90,
};
assert.equal(
  inSelectionRectangle(
    bay,
    100,
    selectionRectangle({ x: 90, y: 90 }, { x: 230, y: 350 }),
  ),
  true,
);
assert.equal(
  inSelectionRectangle(
    bay,
    100,
    selectionRectangle({ x: 90, y: 90 }, { x: 230, y: 300 }),
  ),
  false,
);
assert.equal(
  inSelectionRectangle(
    bay,
    100,
    selectionRectangle({ x: 230, y: 90 }, { x: 210, y: 200 }),
  ),
  true,
);
assert.deepEqual(combineSelection(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
assert.deepEqual(combineSelection(["a", "b"], ["a"], true), ["b"]);
console.log("Window/crossing geometry tests passed.");
