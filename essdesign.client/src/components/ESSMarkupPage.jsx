import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  MousePointer2,
  Hand,
  Ruler,
  Grid2X2,
  Upload,
  Download,
  Save,
  FolderOpen,
  Undo2,
  Redo2,
  RotateCw,
  Trash2,
  Minus,
  Plus,
  Maximize,
  Pencil,
  Type,
  FileText,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  Crosshair,
  FilePlus,
  Move,
} from "lucide-react";
import {
  BAY_SIZES,
  emptySheet,
  referenceScale,
  itemSize,
  hitItem,
  drawSheet,
  validateProject,
} from "../utils/markup";
import "./ESSMarkupPage.css";
import {
  selectionRectangle,
  inSelectionRectangle,
  objectBounds,
  combineSelection,
} from "../utils/markupSelection";
import {
  SNAP_MODES,
  snapGeometry,
  resolveDrawingPoint,
} from "../utils/markupSnaps";
const loadImage = (src) =>
  new Promise((resolve, reject) => {
    if (!src) return resolve(null);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Could not load the drawing image."));
    image.src = src;
  });
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const initial = () => ({
  title: "Untitled scaffold drawing",
  sheets: [emptySheet()],
});
export default function ESSMarkupPage({ draft }) {
  const [project, setProject] = useState(() => draft?.project || initial());
  const [index, setIndex] = useState(0),
    [tool, setTool] = useState("select"),
    [selected, setSelected] = useState([]);
  const [view, setView] = useState({ x: 50, y: 50, zoom: 0.65 }),
    [size, setSize] = useState({ width: 800, height: 600 });
  const [bay, setBay] = useState({ length: 2.4, depth: 1.2, rotation: 0 });
  const [moveBase, setMoveBase] = useState(null);
  const [moveSelecting, setMoveSelecting] = useState(false);
  const [quickMenu, setQuickMenu] = useState(null);
  const lastCommand = useRef("line");
  const [selectionBox, setSelectionBox] = useState(null);
  const [snap, setSnap] = useState(true);
  const [osnap, setOsnap] = useState(true);
  const [snapModes, setSnapModes] = useState([
    "endpoint",
    "midpoint",
    "intersection",
  ]);
  const [snapOverride, setSnapOverride] = useState(null);
  const [snapMenu, setSnapMenu] = useState(null);
  const [ortho, setOrtho] = useState(false);
  const [pointer, setPointer] = useState(null);
  const [snapCycle, setSnapCycle] = useState(0);
  const lineIds = useRef([]),
    commandInput = useRef(null);

  const [ribbonTab, setRibbonTab] = useState("Home");
  const [panelsOpen, setPanelsOpen] = useState(true);
  const [grid, setGrid] = useState(true);
  const [command, setCommand] = useState("");
  const [commandMessage, setCommandMessage] = useState("");
  const crosshair = useRef(null),
    coordinates = useRef(null);
  const [note, setNote] = useState("Scaffold access"),
    [points, setPoints] = useState([]),
    [reference, setReference] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(draft?.dirty || false);
  const [history, setHistory] = useState({ past: [], future: [] }),
    [background, setBackground] = useState(null);
  const canvas = useRef(null),
    host = useRef(null),
    pdfInput = useRef(null),
    projectInput = useRef(null),
    drag = useRef(null);
  const sheet = project.sheets[index],
    selection =
      selected.length === 1
        ? sheet.items.find((item) => item.id === selected[0])
        : null;
  const rectangle = selectionBox
    ? selectionRectangle(selectionBox.start, selectionBox.end)
    : null;
  const boxHits = useMemo(
    () =>
      rectangle
        ? sheet.items
            .filter((item) =>
              inSelectionRectangle(item, sheet.pixelsPerMetre, rectangle),
            )
            .map((item) => item.id)
        : [],
    [sheet.items, sheet.pixelsPerMetre, selectionBox],
  );
  const highlighted = useMemo(
    () =>
      new Set(
        selectionBox
          ? combineSelection(selected, boxHits, selectionBox.subtract)
          : selected,
      ),
    [selected, selectionBox, boxHits],
  );
  const geometry = useMemo(
    () =>
      snapGeometry(
        tool === "move" && moveBase
          ? sheet.items.filter((i) => !selected.includes(i.id))
          : sheet.items,
        sheet.pixelsPerMetre,
      ),
    [sheet.items, sheet.pixelsPerMetre, tool, moveBase, selected],
  );
  const anchor =
    tool === "line" ? points.at(-1) : tool === "move" ? moveBase : null;
  function drawingPoint(raw) {
    return resolveDrawingPoint(raw, {
      geometry,
      modes:
        snapOverride === "none"
          ? []
          : snapOverride
            ? [snapOverride]
            : osnap
              ? snapModes
              : [],
      tolerance: 10 / view.zoom,
      anchor,
      gridStep:
        snap && ["line", "bay", "move"].includes(tool)
          ? sheet.pixelsPerMetre * 0.1
          : 0,
      ortho: ["line", "move"].includes(tool) && ortho,
      cycle: snapCycle,
    });
  }
  const livePoint =
    pointer &&
    (["line", "scale", "bay", "note"].includes(tool) ||
      (tool === "move" && !moveSelecting))
      ? drawingPoint({
          x: (pointer.x - view.x) / view.zoom,
          y: (pointer.y - view.y) / view.zoom,
        })
      : null;
  const liveScreen = livePoint
    ? {
        x: livePoint.x * view.zoom + view.x,
        y: livePoint.y * view.zoom + view.y,
      }
    : null;
  const snapLabel = SNAP_MODES.find(([key]) => key === livePoint?.mode)?.[1];
  const safeName =
    project.title.replace(/[^a-z0-9 _-]/gi, "").trim() || "ESS Markup";
  useEffect(() => {
    if (draft) {
      draft.project = project;
      draft.dirty = dirty;
    }
  }, [draft, project, dirty]);
  function commit(next) {
    setHistory((h) => ({ past: [...h.past.slice(-39), project], future: [] }));
    setProject(next);
    setDirty(true);
  }
  function updateSheet(next) {
    commit({
      ...project,
      sheets: project.sheets.map((s, i) => (i === index ? next : s)),
    });
  }
  function changeTool(value) {
    cancelDrag();
    setTool(value);
    setMoveBase(null);
    setMoveSelecting(false);
    setQuickMenu(null);
    if (value !== "select") lastCommand.current = value;
    setPoints([]);
    lineIds.current = [];
    setPointer(null);
    setSnapOverride(null);
    setSnapMenu(null);
    setError("");
    setCommandMessage("");
    if (["scale", "note", "bay"].includes(value)) setPanelsOpen(true);
  }
  function beginMove() {
    changeTool("move");
    setMoveSelecting(selected.length === 0);
  }
  function confirmMoveSelection() {
    if (!selected.length) {
      setError("Select at least one object to move.");
      return;
    }
    cancelDrag();
    setMoveSelecting(false);
    setPointer(null);
    setError("");
  }
  function translatedItems(destination) {
    const dx = destination.x - moveBase.x,
      dy = destination.y - moveBase.y;
    return sheet.items.map((item) =>
      selected.includes(item.id)
        ? {
            ...item,
            x: item.x + dx,
            y: item.y + dy,
            ...(item.type === "line"
              ? { x2: item.x2 + dx, y2: item.y2 + dy }
              : {}),
          }
        : item,
    );
  }
  function commitMove(destination) {
    const items = translatedItems(destination);
    if (
      items.some(
        (i) =>
          selected.includes(i.id) &&
          (() => {
            const b = objectBounds(i, sheet.pixelsPerMetre);
            return (
              b.left < 0 ||
              b.top < 0 ||
              b.right > sheet.width ||
              b.bottom > sheet.height
            );
          })(),
      )
    ) {
      setError(
        "The moved objects must fit inside the drawing boundary. Choose another destination.",
      );
      return;
    }
    if (
      Math.hypot(destination.x - moveBase.x, destination.y - moveBase.y) > 1e-7
    )
      updateSheet({ ...sheet, items });
    changeTool("select");
    setSelected([]);
  }
  function contextAction(action) {
    setQuickMenu(null);
    action();
    canvas.current?.focus();
  }
  function openQuickMenu(e) {
    e.preventDefault();
    if (busy) return;
    if (!selected.length && tool === "select") {
      const p = point(e);
      const item = [...sheet.items]
        .reverse()
        .find((i) => hitItem(i, p, sheet.pixelsPerMetre, 6 / view.zoom));
      if (item) setSelected([item.id]);
    }
    if (crosshair.current) crosshair.current.style.display = "none";
    setQuickMenu({
      x: Math.max(4, Math.min(e.clientX, window.innerWidth - 250)),
      y: Math.max(4, Math.min(e.clientY, window.innerHeight - 440)),
    });
    setSnapMenu(null);
  }
  function fit() {
    const zoom = Math.max(
      0.05,
      Math.min(
        (size.width - 80) / sheet.width,
        (size.height - 80) / sheet.height,
      ),
    );
    setView({
      zoom,
      x: (size.width - sheet.width * zoom) / 2,
      y: (size.height - sheet.height * zoom) / 2,
    });
  }
  function undo(redo = false) {
    if (busy) return;
    const from = redo ? history.future : history.past;
    if (!from.length) return;
    changeTool("select");
    setProject(from[from.length - 1]);
    setHistory(
      redo
        ? { past: [...history.past, project], future: from.slice(0, -1) }
        : { past: from.slice(0, -1), future: [...history.future, project] },
    );
    setSelected([]);
    setPoints([]);
    lineIds.current = [];
    setPointer(null);
    setDirty(true);
  }
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setBackground(null);
    loadImage(sheet.image)
      .then((image) => {
        if (!cancelled) setBackground(image);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [sheet.image]);
  useEffect(() => {
    fit();
  }, [sheet.id, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSelected([]);
    setPoints([]);
    lineIds.current = [];
    setPointer(null);
    setSnapOverride(null);
  }, [sheet.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    paint();
  }, [
    sheet,
    background,
    highlighted,
    view,
    size,
    grid,
    points,
    tool,
    moveBase,
    livePoint,
  ]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function paint() {
    if (!canvas.current) return;
    const ctx = canvas.current.getContext("2d"),
      ratio = window.devicePixelRatio || 1;
    canvas.current.width = size.width * ratio;
    canvas.current.height = size.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#212830";
    ctx.fillRect(0, 0, size.width, size.height);
    const spacing = Math.max(12, sheet.pixelsPerMetre * 0.5 * view.zoom);
    ctx.strokeStyle = grid ? "#29323b" : "#212830";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = view.x % spacing; x < size.width; x += spacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size.height);
    }
    for (let y = view.y % spacing; y < size.height; y += spacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(size.width, y);
    }
    ctx.stroke();
    ctx.translate(view.x, view.y);
    ctx.scale(view.zoom, view.zoom);
    drawSheet(
      ctx,
      tool === "move" && moveBase && livePoint
        ? { ...sheet, items: translatedItems(livePoint) }
        : sheet,
      background,
      highlighted,
      !sheet.image,
    );
    if (!sheet.image) {
      ctx.save();
      ctx.strokeStyle = "#3a454f";
      ctx.lineWidth = 1 / view.zoom;
      ctx.setLineDash([4 / view.zoom, 6 / view.zoom]);
      ctx.strokeRect(0, 0, sheet.width, sheet.height);
      ctx.restore();
    }
    ctx.fillStyle = "#e87924";
    (tool === "line" ? points.slice(-1) : points).forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 / view.zoom, 0, Math.PI * 2);
      ctx.fill();
    });
    if (tool === "scale" && points.length === 2) {
      ctx.strokeStyle = "#e87924";
      ctx.lineWidth = 2 / view.zoom;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
    }
  }
  function point(e, useSnap = false) {
    const rect = canvas.current.getBoundingClientRect();
    let x = (e.clientX - rect.left - view.x) / view.zoom,
      y = (e.clientY - rect.top - view.y) / view.zoom;
    if (useSnap && snap) {
      const step = sheet.pixelsPerMetre * 0.1;
      x = Math.round(x / step) * step;
      y = Math.round(y / step) * step;
    }
    return { x, y };
  }
  function add(item) {
    updateSheet({
      ...sheet,
      items: [...sheet.items, { ...item, id: crypto.randomUUID() }],
    });
  }
  function down(e) {
    if (busy) return;
    canvas.current.focus();
    canvas.current.setPointerCapture(e.pointerId);
    if (e.button === 2) return;
    if (tool === "pan" || e.button === 1) {
      cancelDrag();
      drag.current = { mode: "pan", x: e.clientX, y: e.clientY, view };
      return;
    }
    if (e.button !== 0) return;
    const p =
      ["line", "scale", "bay", "note", "move"].includes(tool) && !moveSelecting
        ? drawingPoint(point(e))
        : point(e);
    if (tool === "select" || (tool === "move" && moveSelecting)) {
      if (drag.current?.mode === "box") {
        finishSelection(p);
        return;
      }
      const item = [...sheet.items]
        .reverse()
        .find((i) => hitItem(i, p, sheet.pixelsPerMetre, 6 / view.zoom));
      if (item) {
        if (e.shiftKey) {
          setSelected((ids) => ids.filter((id) => id !== item.id));
          return;
        }
        const ids = combineSelection(selected, [item.id]);
        setSelected(ids);
        if (tool === "move") return;
        drag.current = {
          mode: "item",
          start: p,
          items: sheet.items.filter((i) => ids.includes(i.id)),
          original: project,
          moved: false,
        };
      } else {
        drag.current = {
          mode: "box",
          start: p,
          end: p,
          subtract: e.shiftKey,
          base: selected,
        };
        setSelectionBox({ start: p, end: p, subtract: e.shiftKey });
      }
      return;
    }
    if (
      tool !== "move" &&
      (p.x < 0 || p.y < 0 || p.x > sheet.width || p.y > sheet.height)
    )
      return;
    if (snapOverride && snapOverride !== "none" && !p.mode) {
      setError(
        "No matching snap point nearby. Move closer to an object or choose None.",
      );
      return;
    }
    setSnapOverride(null);
    setSnapCycle(0);
    setError("");
    if (tool === "move") {
      if (!moveBase) setMoveBase({ x: p.x, y: p.y });
      else commitMove(p);
      return;
    }
    if (tool === "scale") {
      setPoints(points.length >= 2 ? [p] : [...points, p]);
      return;
    }
    if (tool === "bay") {
      const { w, h } = itemSize({ type: "bay", ...bay }, sheet.pixelsPerMetre);
      if (p.x + w > sheet.width || p.y + h > sheet.height)
        return setError("The bay must fit inside the drawing boundary.");
      add({ type: "bay", ...p, ...bay });
      setError("");
    } else if (tool === "note" && note.trim())
      add({ type: "note", ...p, text: note.trim() });
    else if (tool === "line") {
      appendLinePoint(p);
    }
  }

  function appendLinePoint(p) {
    if (p.x < 0 || p.y < 0 || p.x > sheet.width || p.y > sheet.height) {
      setError("Point must be inside the drawing boundary.");
      return false;
    }
    const clean = { x: p.x, y: p.y };
    if (!points.length) {
      setPoints([clean]);
      return true;
    }
    if (Math.hypot(p.x - anchor.x, p.y - anchor.y) < 1e-7) {
      setError("Specify a different point for a non-zero line.");
      return false;
    }
    const id = crypto.randomUUID();
    updateSheet({
      ...sheet,
      items: [
        ...sheet.items,
        { id, type: "line", ...anchor, x2: p.x, y2: p.y },
      ],
    });
    lineIds.current.push(id);
    setPoints([...points, clean]);
    setError("");
    setCommandMessage("");
    return true;
  }
  function finishLine(close = false) {
    if (
      close &&
      points.length >= 3 &&
      Math.hypot(points[0].x - anchor.x, points[0].y - anchor.y) > 1e-7
    )
      appendLinePoint(points[0]);
    changeTool("select");
  }
  function undoLine() {
    const id = lineIds.current.pop();
    if (id) {
      updateSheet({ ...sheet, items: sheet.items.filter((i) => i.id !== id) });
      setPoints(points.slice(0, -1));
    } else setPoints([]);
    setCommandMessage("");
  }
  function lineEnter() {
    if (points.length) finishLine();
    else {
      const last = [...sheet.items].reverse().find((i) => i.type === "line");
      if (last) setPoints([{ x: last.x2, y: last.y2 }]);
    }
  }
  function openSnapMenu(e, kind = "settings") {
    e.preventDefault();
    const width = 270,
      height = 390;
    setSnapMenu({
      kind,
      x: Math.max(4, Math.min(e.clientX, window.innerWidth - width - 4)),
      y: Math.max(4, Math.min(e.clientY, window.innerHeight - height - 4)),
    });
  }
  function draftingKeys(e) {
    if (busy) return;
    if (["F3", "F8", "F9"].includes(e.key)) {
      e.preventDefault();
      if (e.key === "F3") setOsnap((v) => !v);
      if (e.key === "F8") setOrtho((v) => !v);
      if (e.key === "F9") setSnap((v) => !v);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setCommand("");
      if (quickMenu) {
        setQuickMenu(null);
        canvas.current?.focus();
        return;
      }
      if (snapMenu) {
        setSnapMenu(null);
        canvas.current?.focus();
        return;
      }
      changeTool("select");
      setSelected([]);
      return;
    }
    if (e.target !== canvas.current) return;
    if (e.key === "Tab" && livePoint?.candidates.length) {
      e.preventDefault();
      setSnapCycle((v) => v + 1);
      return;
    }
    if (tool === "move") {
      if (e.key === "Enter" && moveSelecting) {
        e.preventDefault();
        confirmMoveSelection();
        return;
      }
      if (moveBase && !e.ctrlKey && !e.metaKey && /^[0-9.@+-]$/.test(e.key)) {
        e.preventDefault();
        setCommand(e.key);
        commandInput.current?.focus();
        return;
      }
    }
    if (tool === "line") {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        lineEnter();
        return;
      }
      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
        undoLine();
        return;
      }
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        e.key.toLowerCase() === "c" &&
        points.length >= 3
      ) {
        e.preventDefault();
        finishLine(true);
        return;
      }
      if (!e.ctrlKey && !e.metaKey && /^[0-9.+-]$/.test(e.key)) {
        e.preventDefault();
        setCommand(e.key);
        commandInput.current?.focus();
        return;
      }
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo(e.shiftKey);
    }
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "pan") {
      setView({
        ...d.view,
        x: d.view.x + e.clientX - d.x,
        y: d.view.y + e.clientY - d.y,
      });
      return;
    }
    const p = point(e);
    if (d.mode === "box") {
      d.end = p;
      setSelectionBox({ start: d.start, end: p, subtract: d.subtract });
      return;
    }
    let dx = p.x - d.start.x,
      dy = p.y - d.start.y;
    if (snap) {
      const step = sheet.pixelsPerMetre * 0.1;
      dx = Math.round(dx / step) * step;
      dy = Math.round(dy / step) * step;
    }
    const bounds = d.items.map((i) => objectBounds(i, sheet.pixelsPerMetre));
    const left = Math.min(...bounds.map((b) => b.left)),
      right = Math.max(...bounds.map((b) => b.right)),
      top = Math.min(...bounds.map((b) => b.top)),
      bottom = Math.max(...bounds.map((b) => b.bottom));
    dx = Math.max(-left, Math.min(sheet.width - right, dx));
    dy = Math.max(-top, Math.min(sheet.height - bottom, dy));
    if (dx === d.dx && dy === d.dy) return;
    d.dx = dx;
    d.dy = dy;
    d.moved = Math.abs(dx) > 1e-7 || Math.abs(dy) > 1e-7;
    const moved = new Map(
      d.items.map((item) => [
        item.id,
        {
          ...item,
          x: item.x + dx,
          y: item.y + dy,
          ...(item.type === "line"
            ? { x2: item.x2 + dx, y2: item.y2 + dy }
            : {}),
        },
      ]),
    );
    const next = {
      ...d.original,
      sheets: d.original.sheets.map((s, i) =>
        i === index
          ? { ...s, items: s.items.map((item) => moved.get(item.id) || item) }
          : s,
      ),
    };
    setProject(next);
  }
  function finishSelection(end) {
    const d = drag.current;
    if (d?.mode === "box") {
      if (Math.hypot(end.x - d.start.x, end.y - d.start.y) * view.zoom >= 4) {
        const rect = selectionRectangle(d.start, end);
        const hits = sheet.items
          .filter((i) => inSelectionRectangle(i, sheet.pixelsPerMetre, rect))
          .map((i) => i.id);
        setSelected(combineSelection(d.base, hits, d.subtract));
      } else if (!d.subtract) setSelected([]);
    }
    drag.current = null;
    setSelectionBox(null);
  }
  function up() {
    const d = drag.current;
    if (d?.mode === "box") return;
    if (d?.mode === "item" && d.moved) {
      const original = d.original;
      setHistory((h) => ({
        past: [...h.past.slice(-39), original],
        future: [],
      }));
      setDirty(true);
    }
    drag.current = null;
    setSelectionBox(null);
  }
  function cancelDrag() {
    if (drag.current?.mode === "item") setProject(drag.current.original);
    drag.current = null;
    setSelectionBox(null);
  }
  function zoom(factor, x = size.width / 2, y = size.height / 2) {
    setView((v) => {
      const z = Math.min(8, Math.max(0.05, v.zoom * factor));
      return {
        zoom: z,
        x: x - ((x - v.x) * z) / v.zoom,
        y: y - ((y - v.y) * z) / v.zoom,
      };
    });
  }
  function remove() {
    if (busy) return;
    if (selected.length) {
      changeTool("select");
      updateSheet({
        ...sheet,
        items: sheet.items.filter((i) => !selected.includes(i.id)),
      });
      setSelected([]);
    }
  }
  function rotate() {
    if (selection?.type === "bay") {
      const updated = {
        ...selection,
        rotation: (selection.rotation + 90) % 360,
      };
      const { w, h } = itemSize(updated, sheet.pixelsPerMetre);
      if (w > sheet.width || h > sheet.height)
        return setError("Rotated bay does not fit on the sheet.");
      updated.x = Math.min(updated.x, sheet.width - w);
      updated.y = Math.min(updated.y, sheet.height - h);
      updateSheet({
        ...sheet,
        items: sheet.items.map((i) => (i.id === selection.id ? updated : i)),
      });
    } else setBay({ ...bay, rotation: (bay.rotation + 90) % 360 });
  }
  async function importPdf(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 40 * 1024 * 1024)
      return setError("Please use a PDF smaller than 40 MB.");
    setBusy(true);
    setError("");
    let pdf;
    try {
      const lib = await import("pdfjs-dist/build/pdf.mjs");
      lib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).href;
      pdf = await lib.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        isEvalSupported: false,
      }).promise;
      if (pdf.numPages + project.sheets.length > 30)
        throw new Error("A project supports up to 30 sheets.");
      const sheets = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n),
          base = page.getViewport({ scale: 1 }),
          viewport = page.getViewport({
            scale: Math.min(2, 2200 / Math.max(base.width, base.height)),
          });
        const off = document.createElement("canvas");
        off.width = Math.ceil(viewport.width);
        off.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: off.getContext("2d"), viewport })
          .promise;
        sheets.push({
          ...emptySheet(),
          name: `${file.name} · ${n}`,
          width: off.width,
          height: off.height,
          image: off.toDataURL("image/png"),
          calibrated: false,
        });
        page.cleanup();
      }
      const replaceBlank =
        project.sheets.length === 1 && !sheet.image && !sheet.items.length;
      const start = replaceBlank ? 0 : project.sheets.length;
      commit({
        ...project,
        sheets: [...(replaceBlank ? [] : project.sheets), ...sheets],
      });
      setIndex(start);
      setHistory({ past: [], future: [] });
      changeTool("scale");
    } catch (err) {
      setError(
        err.name === "PasswordException"
          ? "Please import an unlocked PDF."
          : err.message || "Could not import this PDF.",
      );
    } finally {
      await pdf?.destroy();
      setBusy(false);
    }
  }
  async function openProject(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (
      dirty &&
      !window.confirm(
        "Replace this drawing? Save your editable file first to keep your changes.",
      )
    )
      return;
    setBusy(true);
    try {
      if (file.size > 100 * 1024 * 1024)
        throw new Error("File exceeds the 100 MB limit.");
      const data = validateProject(JSON.parse(await file.text()));
      setProject({ title: data.title, sheets: data.sheets });
      setIndex(0);
      setHistory({ past: [], future: [] });
      setDirty(false);
      setError("");
      changeTool("select");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function exportPdf() {
    setBusy(true);
    setError("");
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a3",
      });
      for (let i = 0; i < project.sheets.length; i++) {
        if (i) pdf.addPage("a3", "landscape");
        const s = project.sheets[i],
          off = document.createElement("canvas");
        off.width = s.width;
        off.height = s.height;
        drawSheet(off.getContext("2d"), s, await loadImage(s.image));
        const factor = Math.min(396 / s.width, 252 / s.height);
        pdf.addImage(
          off.toDataURL("image/png"),
          "PNG",
          12 + (396 - s.width * factor) / 2,
          12,
          s.width * factor,
          s.height * factor,
        );
        pdf.setFontSize(10);
        pdf.text(project.title.slice(0, 100), 12, 277);
        pdf.setFontSize(8);
        pdf.text(
          `ESS Markup | ${i + 1}/${project.sheets.length} | ${s.calibrated ? "Reference calibrated" : "UNCALIBRATED"} | Diagrammatic - do not scale from print`,
          12,
          284,
        );
      }
      pdf.save(`${safeName}.pdf`);
    } catch (err) {
      setError(`Export failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function saveDrawing() {
    download(
      new Blob([JSON.stringify({ version: 1, ...project })], {
        type: "application/json",
      }),
      `${safeName}.essmarkup`,
    );
    setDirty(false);
  }
  function selectSheet(i) {
    setIndex(i);
    setHistory({ past: [], future: [] });
    changeTool("select");
  }
  function newDrawing() {
    if (
      busy ||
      (dirty &&
        !window.confirm(
          "Start a new drawing? Save your editable drawing first to keep your changes.",
        ))
    )
      return;
    setProject(initial());
    setIndex(0);
    setHistory({ past: [], future: [] });
    setDirty(false);
    setSelected([]);
    changeTool("select");
  }
  function runCommand(e) {
    e.preventDefault();
    if (busy) return;
    const value = command.trim().toLowerCase();
    if (tool === "move" && moveSelecting && !value) {
      confirmMoveSelection();
      setCommand("");
      canvas.current?.focus();
      return;
    }
    if (tool === "move" && moveBase) {
      const vector = value.match(
        /^@([+-]?(?:\d+\.?\d*|\.\d+)),([+-]?(?:\d+\.?\d*|\.\d+))$/,
      );
      if (vector) {
        commitMove({
          x: moveBase.x + Number(vector[1]) * sheet.pixelsPerMetre,
          y: moveBase.y - Number(vector[2]) * sheet.pixelsPerMetre,
        });
        setCommand("");
        canvas.current?.focus();
        return;
      }
      if (/^[+]?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
        const length = Number(value) * sheet.pixelsPerMetre,
          distance = livePoint
            ? Math.hypot(livePoint.x - moveBase.x, livePoint.y - moveBase.y)
            : 0;
        if (!Number.isFinite(length) || length <= 0 || distance < 1e-7)
          setError("Aim the cursor, then enter a positive distance in metres.");
        else
          commitMove({
            x: moveBase.x + ((livePoint.x - moveBase.x) / distance) * length,
            y: moveBase.y + ((livePoint.y - moveBase.y) / distance) * length,
          });
        setCommand("");
        canvas.current?.focus();
        return;
      }
    }
    if (tool === "line") {
      if (!value) {
        lineEnter();
        setCommand("");
        canvas.current?.focus();
        return;
      }
      if (["u", "undo"].includes(value)) {
        undoLine();
        setCommand("");
        canvas.current?.focus();
        return;
      }
      if (["c", "close"].includes(value)) {
        if (points.length >= 3) finishLine(true);
        else setError("Draw at least two segments before Close.");
        setCommand("");
        canvas.current?.focus();
        return;
      }
      if (/^[+]?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
        const length = Number(value) * sheet.pixelsPerMetre;
        const distance =
          anchor && livePoint
            ? Math.hypot(livePoint.x - anchor.x, livePoint.y - anchor.y)
            : 0;
        if (
          !Number.isFinite(length) ||
          length <= 0 ||
          !anchor ||
          distance < 1e-7
        )
          setError(
            "Pick a starting point, aim the cursor, then enter a positive length in metres.",
          );
        else {
          appendLinePoint({
            x: anchor.x + ((livePoint.x - anchor.x) / distance) * length,
            y: anchor.y + ((livePoint.y - anchor.y) / distance) * length,
          });
          setSnapOverride(null);
        }
        setCommand("");
        canvas.current?.focus();
        return;
      }
    }
    if (["osnap", "dsettings"].includes(value)) {
      setSnapMenu({
        kind: "settings",
        x: Math.max(4, window.innerWidth - 285),
        y: Math.max(4, window.innerHeight - 425),
      });
      setCommand("");
      return;
    }

    const commands = {
      l: "line",
      line: "line",
      b: "bay",
      bay: "bay",
      m: "move",
      move: "move",
      select: "select",
      p: "pan",
      pan: "pan",
      sc: "scale",
      scale: "scale",
      t: "note",
      text: "note",
      note: "note",
    };
    if (commands[value]) {
      if (commands[value] === "bay" && !sheet.calibrated) {
        setCommandMessage("BAY: Calibrate the PDF using SCALE first.");
        setCommand("");
        return;
      }
      if (commands[value] === "move") beginMove();
      else changeTool(commands[value]);
    } else if (["z", "zoom", "fit"].includes(value)) {
      fit();
      setCommandMessage("ZOOM: Extents");
    } else if (["u", "undo"].includes(value)) undo();
    else if (value === "redo") undo(true);
    else if (["save", "qsave"].includes(value)) saveDrawing();
    else if (["export", "plot"].includes(value)) exportPdf();
    else if (["erase", "delete"].includes(value)) remove();
    else if (["r", "rotate"].includes(value)) rotate();
    else if (["esc", "cancel"].includes(value)) changeTool("select");
    else {
      setCommandMessage(
        "Commands: LINE, BAY, MOVE, PAN, SCALE, NOTE, ROTATE, ERASE, UNDO, REDO, ZOOM, SAVE, PLOT",
      );
    }
    setCommand("");
    canvas.current?.focus();
  }
  const hint =
    tool === "move"
      ? moveSelecting
        ? `MOVE: Select objects (${selected.length} selected), then press Enter.`
        : moveBase
          ? "MOVE: Specify second point. Enter distance or @X,Y displacement in metres. Esc cancels."
          : "MOVE: Specify base point."
      : tool === "scale"
        ? `SCALE: Specify reference point ${Math.min(points.length + 1, 2)} of 2, then enter the known length.`
        : tool === "bay"
          ? "INSERT BAY: Specify insertion point. Rotate changes the orientation."
          : tool === "line"
            ? `LINE: ${points.length ? "Specify next point or [Close / Undo]. Enter to finish · length in metres" : "Specify first point. Enter to continue last line"}`
            : tool === "note"
              ? "TEXT: Specify insertion point. Edit text in Properties."
              : tool === "pan"
                ? "PAN: Drag to move the view. Scroll to zoom."
                : "Select: click first corner, then opposite corner. Right = Window; left = Crossing. Esc cancels.";
  const toolButton = (key, Icon, label) => (
    <button
      className={`cad-tool ${tool === key ? "active" : ""}`}
      aria-pressed={tool === key}
      disabled={busy || (key === "bay" && !sheet.calibrated)}
      onClick={() => changeTool(key)}
    >
      <Icon size={27} strokeWidth={1.25} />
      <span>{label}</span>
    </button>
  );
  return (
    <div className="ess-markup" onKeyDown={draftingKeys}>
      <header className="cad-titlebar">
        <span className="cad-brand" title="ESS Markup">
          E
        </span>
        <div className="cad-quick-access">
          <button
            aria-label="New drawing"
            title="New drawing"
            onClick={newDrawing}
            disabled={busy}
          >
            <FilePlus size={15} />
          </button>
          <button
            aria-label="Open"
            title="Open drawing"
            onClick={() => projectInput.current.click()}
            disabled={busy}
          >
            <FolderOpen size={15} />
          </button>
          <button
            aria-label="Save drawing"
            title="Save drawing"
            onClick={saveDrawing}
            disabled={busy}
          >
            <Save size={15} />
          </button>
          <button
            aria-label="Undo"
            title="Undo"
            onClick={() => undo()}
            disabled={!history.past.length || busy}
          >
            <Undo2 size={15} />
          </button>
          <button
            aria-label="Redo"
            title="Redo"
            onClick={() => undo(true)}
            disabled={!history.future.length || busy}
          >
            <Redo2 size={15} />
          </button>
        </div>
        <div className="cad-document-title">
          <span>ESS Markup</span>
          <input
            aria-label="Drawing title"
            value={project.title}
            maxLength={100}
            onChange={(e) => {
              setProject({ ...project, title: e.target.value });
              setDirty(true);
            }}
          />
          {dirty && <span title="Unsaved changes">*</span>}
        </div>
        <span className="cad-save-state">
          {dirty ? "Unsaved drawing" : "Local drawing"}
        </span>
      </header>
      <nav className="cad-ribbon-tabs" aria-label="Ribbon tabs">
        {["Home", "Insert", "Annotate", "View"].map((tab) => (
          <button
            key={tab}
            aria-pressed={tab === ribbonTab}
            className={tab === ribbonTab ? "active" : ""}
            onClick={() => setRibbonTab(tab)}
          >
            {tab}
          </button>
        ))}
        <span className="cad-workspace-name">
          Drafting & annotation <ChevronDown size={11} />
        </span>
      </nav>
      <div className="cad-ribbon" role="toolbar" aria-label="Drawing tools">
        {ribbonTab === "Home" && (
          <>
            <section className="cad-ribbon-group">
              <div className="cad-ribbon-controls">
                {toolButton("line", Pencil, "Line")}
                {toolButton("select", MousePointer2, "Select")}
              </div>
              <span className="cad-group-caption">
                Draw <ChevronDown size={10} />
              </span>
            </section>
            <section className="cad-ribbon-group">
              <div className="cad-ribbon-controls cad-modify">
                <button
                  onClick={beginMove}
                  aria-pressed={tool === "move"}
                  className={tool === "move" ? "active" : ""}
                  disabled={busy}
                >
                  <Move size={17} /> Move
                </button>
                <button
                  onClick={rotate}
                  disabled={
                    busy ||
                    (selection ? selection.type !== "bay" : tool !== "bay")
                  }
                  title="Rotate bay 90 degrees"
                >
                  <RotateCw size={17} /> Rotate
                </button>
                <button
                  aria-label="Delete selected"
                  onClick={remove}
                  disabled={!selected.length || busy}
                >
                  <Trash2 size={17} /> Erase
                </button>
              </div>
              <span className="cad-group-caption">
                Modify <ChevronDown size={10} />
              </span>
            </section>
          </>
        )}
        {["Home", "Annotate"].includes(ribbonTab) && (
          <section className="cad-ribbon-group">
            <div className="cad-ribbon-controls">
              {toolButton("note", Type, "Note")}
              {toolButton("scale", Ruler, "Set scale")}
            </div>
            <span className="cad-group-caption">
              Annotation <ChevronDown size={10} />
            </span>
          </section>
        )}
        {["Home", "Insert"].includes(ribbonTab) && (
          <>
            <section className="cad-ribbon-group">
              <div className="cad-ribbon-controls">
                {toolButton("bay", Grid2X2, "Scaffold bay")}
                <div className="cad-block-description">
                  <strong>Scaffold plan bay</strong>
                  <span>
                    {bay.length.toFixed(1)} × {bay.depth.toFixed(1)} m
                  </span>
                  <span>Rotation: {bay.rotation}°</span>
                </div>
              </div>
              <span className="cad-group-caption">
                Block library <ChevronDown size={10} />
              </span>
            </section>
            <section className="cad-ribbon-group">
              <div className="cad-ribbon-controls">
                <button
                  className="cad-tool"
                  onClick={() => pdfInput.current.click()}
                  disabled={busy}
                >
                  <Upload size={27} strokeWidth={1.25} />
                  <span>Import PDF</span>
                </button>
                <div className="cad-block-description">
                  <strong>PDF underlay</strong>
                  <span>
                    {sheet.image
                      ? "Attached to current sheet"
                      : "No underlay attached"}
                  </span>
                  <span>
                    {sheet.calibrated
                      ? "Reference scale set"
                      : "Calibration required"}
                  </span>
                </div>
              </div>
              <span className="cad-group-caption">
                Reference <ChevronDown size={10} />
              </span>
            </section>
          </>
        )}
        {["Home", "View"].includes(ribbonTab) && (
          <section className="cad-ribbon-group">
            <div className="cad-ribbon-controls">
              {toolButton("pan", Hand, "Pan")}
              <button
                className="cad-tool"
                aria-label="Fit drawing"
                onClick={fit}
              >
                <Maximize size={27} strokeWidth={1.25} />
                <span>Extents</span>
              </button>
            </div>
            <span className="cad-group-caption">
              Navigate <ChevronDown size={10} />
            </span>
          </section>
        )}
        {ribbonTab === "View" && (
          <section className="cad-ribbon-group">
            <div className="cad-ribbon-controls">
              <button
                className={`cad-tool ${grid ? "active" : ""}`}
                aria-pressed={grid}
                onClick={() => setGrid(!grid)}
              >
                <Grid2X2 size={27} />
                <span>Grid</span>
              </button>
              <button
                className="cad-tool"
                onClick={() => setPanelsOpen(!panelsOpen)}
              >
                <PanelLeftClose size={27} />
                <span>Palettes</span>
              </button>
            </div>
            <span className="cad-group-caption">Display</span>
          </section>
        )}
        <section className="cad-ribbon-group cad-output">
          <div className="cad-ribbon-controls">
            <button className="cad-tool" onClick={exportPdf} disabled={busy}>
              <Download size={27} strokeWidth={1.25} />
              <span>Export PDF</span>
            </button>
          </div>
          <span className="cad-group-caption">Output</span>
        </section>
      </div>
      <div className="cad-document-tabs">
        <button
          aria-label={panelsOpen ? "Hide palettes" : "Show palettes"}
          title="Toggle palettes"
          onClick={() => setPanelsOpen(!panelsOpen)}
        >
          {panelsOpen ? (
            <PanelLeftClose size={15} />
          ) : (
            <PanelLeftOpen size={15} />
          )}
        </button>
        <span className="cad-file-tab">
          <FileText size={13} />
          {project.title}
          {dirty ? " *" : ""}
        </span>
        <button
          aria-label="Start new drawing"
          onClick={newDrawing}
          disabled={busy}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="markup-body">
        {panelsOpen && (
          <aside className="markup-inspector">
            <div className="cad-palette-heading">
              <span>DRAWING MANAGER</span>
              <Layers size={12} />
            </div>
            <div className="cad-palette-content">
              <label className="cad-sheet-select">
                Active sheet
                <select
                  value={index}
                  disabled={busy}
                  onChange={(e) => selectSheet(Number(e.target.value))}
                >
                  {project.sheets.map((s, i) => (
                    <option key={s.id} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="cad-sheet-tree">
                {project.sheets.map((s, i) => (
                  <button
                    key={s.id}
                    className={i === index ? "active" : ""}
                    onClick={() => selectSheet(i)}
                    disabled={busy}
                  >
                    <FileText size={13} />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="cad-palette-heading">
              <span>BLOCKS</span>
              <ChevronDown size={12} />
            </div>
            <div className="cad-block-preview">
              <svg viewBox="0 0 240 95" aria-label="Scaffold bay plan preview">
                <g fill="none" stroke="currentColor" strokeWidth="1">
                  <path d="M38 24H202V77H38Z M41 27H199V74H41Z" />
                  {[
                    [38, 24],
                    [202, 24],
                    [38, 77],
                    [202, 77],
                  ].map(([x, y]) => (
                    <g key={`${x},${y}`}>
                      <rect x={x - 4} y={y - 4} width="8" height="8" />
                      <circle cx={x} cy={y} r="2" />
                    </g>
                  ))}
                  <path d="M38 12H202 M38 8V16 M202 8V16" />
                </g>
                <text
                  x="120"
                  y="9"
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="9"
                >
                  {Math.round(bay.length * 1000)}
                </text>
              </svg>
              <span>STANDARD BAY · PLAN</span>
            </div>
            <div className="cad-palette-heading">
              <span>PROPERTIES</span>
              <ChevronDown size={12} />
            </div>
            <div className="cad-palette-content cad-properties">
              <div className="cad-selection-name">
                {selected.length > 1
                  ? `${selected.length} objects selected`
                  : selection
                    ? `Selected ${selection.type}`
                    : "No selection"}
                <MousePointer2 size={12} />
              </div>
              {tool === "note" && (
                <label className="cad-note-field">
                  Note text
                  <textarea
                    maxLength={120}
                    value={note}
                    onChange={(e) =>
                      setNote(e.target.value.replace(/[\r\n]/g, " "))
                    }
                  />
                </label>
              )}
              {tool === "scale" && (
                <div className="cad-scale-settings">
                  <h2>Reference dimension</h2>
                  <p>Pick two points, then enter the known length.</p>
                  <label>
                    Actual length (metres)
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={points.length !== 2 || busy}
                    onClick={() => {
                      try {
                        const scale = referenceScale(
                          points[0],
                          points[1],
                          Number(reference),
                        );
                        if (
                          sheet.items.some((item) => {
                            if (item.type !== "bay") return false;
                            const { w, h } = itemSize(item, scale);
                            return (
                              item.x + w > sheet.width ||
                              item.y + h > sheet.height
                            );
                          })
                        )
                          throw new Error(
                            "This scale would move existing bays beyond the sheet. Reposition or remove those bays before recalibrating.",
                          );
                        if (
                          sheet.items.some((i) => i.type === "bay") &&
                          !window.confirm(
                            "Changing scale resizes existing scaffold bays. Continue?",
                          )
                        )
                          return;
                        updateSheet({
                          ...sheet,
                          pixelsPerMetre: scale,
                          calibrated: true,
                        });
                        changeTool("select");
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  >
                    Apply scale
                  </button>
                  <small>{points.length} / 2 reference points selected</small>
                </div>
              )}
              <h2>General</h2>
              <dl>
                <dt>Layer</dt>
                <dd>Scaffold</dd>
                <dt>Color</dt>
                <dd>
                  <i className="cad-color-swatch" /> ByLayer
                </dd>
                <dt>View</dt>
                <dd>Top / 2D wireframe</dd>
                <dt>Units</dt>
                <dd>Metres</dd>
                <dt>Reference</dt>
                <dd className={!sheet.calibrated ? "cad-warning" : ""}>
                  {sheet.calibrated ? "Calibrated" : "Not calibrated"}
                </dd>
              </dl>
              {selection && (
                <>
                  <h2>Geometry</h2>
                  <dl>
                    <dt>Position X</dt>
                    <dd>{(selection.x / sheet.pixelsPerMetre).toFixed(3)} m</dd>
                    <dt>Position Y</dt>
                    <dd>{(selection.y / sheet.pixelsPerMetre).toFixed(3)} m</dd>
                    {selection.type === "bay" && (
                      <>
                        <dt>Dimensions</dt>
                        <dd>
                          {selection.length} × {selection.depth} m
                        </dd>
                        <dt>Rotation</dt>
                        <dd>{selection.rotation}°</dd>
                      </>
                    )}
                  </dl>
                </>
              )}
              <h2>Insertion settings</h2>
              <label>
                Bay length
                <select
                  value={bay.length}
                  onChange={(e) =>
                    setBay({ ...bay, length: Number(e.target.value) })
                  }
                >
                  {BAY_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n.toFixed(1)} m
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Bay width
                <select
                  value={bay.depth}
                  onChange={(e) =>
                    setBay({ ...bay, depth: Number(e.target.value) })
                  }
                >
                  {[0.7, 1.2, 1.8].map((n) => (
                    <option key={n} value={n}>
                      {n.toFixed(1)} m
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="cad-insert-button"
                disabled={!sheet.calibrated || busy}
                onClick={() => changeTool("bay")}
              >
                <Grid2X2 size={14} /> Place bay · {bay.rotation}°
              </button>
              <label className="markup-check">
                <input
                  type="checkbox"
                  checked={snap}
                  onChange={(e) => setSnap(e.target.checked)}
                />{" "}
                Snap to 100 mm
              </label>
            </div>
          </aside>
        )}
        <div className="markup-stage" ref={host}>
          <canvas
            ref={canvas}
            aria-label="Scaffold drawing canvas"
            tabIndex={0}
            style={{ cursor: tool === "pan" ? "grab" : "none" }}
            onPointerDown={down}
            onPointerMove={(e) => {
              move(e);
              setSnapCycle(0);
              const rect = canvas.current.getBoundingClientRect();
              setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top });
              if (crosshair.current) {
                crosshair.current.style.left = `${e.clientX - rect.left}px`;
                crosshair.current.style.top = `${e.clientY - rect.top}px`;
                crosshair.current.style.display =
                  e.pointerType === "touch" || tool === "pan"
                    ? "none"
                    : "block";
              }
              const p = point(e);
              if (coordinates.current)
                coordinates.current.textContent = `${(p.x / sheet.pixelsPerMetre).toFixed(3)}, ${(p.y / sheet.pixelsPerMetre).toFixed(3)}, 0.000`;
            }}
            onPointerLeave={() => {
              if (crosshair.current) crosshair.current.style.display = "none";
            }}
            onPointerUp={up}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={() => {
              if (drag.current && drag.current.mode !== "box") cancelDrag();
            }}
            onWheel={(e) => {
              const rect = canvas.current.getBoundingClientRect();
              zoom(
                e.deltaY < 0 ? 1.12 : 1 / 1.12,
                e.clientX - rect.left,
                e.clientY - rect.top,
              );
            }}
            onContextMenu={(e) => {
              if (e.shiftKey) {
                setQuickMenu(null);
                openSnapMenu(e, "override");
              } else openQuickMenu(e);
            }}
          />

          {rectangle && (
            <>
              <svg
                className="cad-selection-overlay"
                width={size.width}
                height={size.height}
                aria-label={
                  rectangle.crossing ? "Crossing selection" : "Window selection"
                }
              >
                <rect
                  data-testid="selection-rectangle"
                  className={
                    rectangle.crossing
                      ? "cad-crossing-rectangle"
                      : "cad-window-rectangle"
                  }
                  x={rectangle.left * view.zoom + view.x}
                  y={rectangle.top * view.zoom + view.y}
                  width={(rectangle.right - rectangle.left) * view.zoom}
                  height={(rectangle.bottom - rectangle.top) * view.zoom}
                />
              </svg>
              <div
                className={`cad-selection-caption ${rectangle.crossing ? "crossing" : "window"}`}
                style={{
                  left: Math.max(
                    8,
                    Math.min(
                      selectionBox.end.x * view.zoom + view.x + 16,
                      size.width - 235,
                    ),
                  ),
                  top: Math.max(
                    28,
                    Math.min(
                      selectionBox.end.y * view.zoom + view.y + 16,
                      size.height - 90,
                    ),
                  ),
                }}
              >
                {selectionBox.subtract ? "Remove · " : ""}
                {rectangle.crossing
                  ? "Crossing · touched objects"
                  : "Window · fully enclosed"}{" "}
                · {boxHits.length}
              </div>
            </>
          )}
          {livePoint && (
            <svg
              className="cad-drafting-overlay"
              width={size.width}
              height={size.height}
              aria-label="Dynamic drafting preview"
            >
              {anchor && (
                <line
                  data-testid={
                    tool === "move" ? "move-preview-vector" : "line-preview"
                  }
                  x1={anchor.x * view.zoom + view.x}
                  y1={anchor.y * view.zoom + view.y}
                  x2={liveScreen.x}
                  y2={liveScreen.y}
                  stroke={sheet.image ? "#007c83" : "#e3edf5"}
                  strokeWidth="1.5"
                />
              )}
              {livePoint.mode && (
                <g
                  data-testid="snap-marker"
                  transform={`translate(${liveScreen.x},${liveScreen.y})`}
                  fill="none"
                  stroke="#79f27e"
                  strokeWidth="2"
                >
                  {livePoint.mode === "midpoint" ? (
                    <path d="M0 -7L7 6H-7Z" />
                  ) : livePoint.mode === "intersection" ? (
                    <path d="M-6 -6L6 6M6 -6L-6 6" />
                  ) : livePoint.mode === "perpendicular" ? (
                    <path d="M-6 -7V6H7M-6 0H0V6" />
                  ) : livePoint.mode === "geometricCenter" ? (
                    <path d="M0 -8L8 0L0 8L-8 0Z" />
                  ) : livePoint.mode === "nearest" ? (
                    <path d="M-7 -6L7 6V-6L-7 6Z" />
                  ) : (
                    <rect x="-6" y="-6" width="12" height="12" />
                  )}
                </g>
              )}
            </svg>
          )}
          {livePoint && (anchor || snapLabel) && (
            <div
              className="cad-dynamic-readout"
              style={{
                left: Math.max(
                  4,
                  Math.min(liveScreen.x + 16, size.width - 185),
                ),
                top: Math.max(
                  25,
                  Math.min(liveScreen.y + 20, size.height - 100),
                ),
              }}
            >
              {snapLabel && (
                <span className="cad-snap-label">
                  {snapLabel}
                  {snapOverride ? " · Override" : ""}
                </span>
              )}
              {anchor && (
                <span data-testid="line-measurement">
                  {(
                    Math.hypot(livePoint.x - anchor.x, livePoint.y - anchor.y) /
                    sheet.pixelsPerMetre
                  ).toFixed(3)}{" "}
                  m <i>∠</i>{" "}
                  {(
                    ((Math.atan2(
                      anchor.y - livePoint.y,
                      livePoint.x - anchor.x,
                    ) *
                      180) /
                      Math.PI +
                      360) %
                    360
                  ).toFixed(1)}
                  °
                </span>
              )}
            </div>
          )}
          <div
            ref={crosshair}
            className={`cad-crosshair ${tool === "select" || (tool === "move" && moveSelecting) ? "cad-pickbox-cursor" : "cad-drawing-cursor"}`}
            aria-hidden="true"
          >
            <i />
          </div>
          <div className="markup-stage-label">
            [Top] [2D Wireframe]{" "}
            <span>{sheet.image ? "PDF underlay" : "Model space"}</span>
          </div>
          <div className="cad-viewcube" aria-label="Top plan view">
            <span className="cad-north">N</span>
            <span className="cad-east">E</span>
            <span className="cad-south">S</span>
            <span className="cad-west">W</span>
            <button title="Fit top view" onClick={fit}>
              TOP
            </button>
            <small>
              WCS <ChevronDown size={9} />
            </small>
          </div>
          <div className="cad-navigation">
            <button
              aria-label="Pan view"
              title="Pan"
              aria-pressed={tool === "pan"}
              onClick={() => changeTool("pan")}
            >
              <Hand size={21} />
            </button>
            <button
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => zoom(1.2)}
            >
              <Plus size={21} />
            </button>
            <button
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => zoom(1 / 1.2)}
            >
              <Minus size={21} />
            </button>
            <button
              aria-label="Zoom extents"
              title="Zoom extents"
              onClick={fit}
            >
              <Maximize size={20} />
            </button>
          </div>
          <div className="cad-ucs" aria-hidden="true">
            <span className="cad-axis-y">Y</span>
            <span className="cad-axis-x">X</span>
            <i />
          </div>
          <div className="cad-commandline">
            <div className="cad-command-history" aria-live="polite">
              {commandMessage || hint}
            </div>
            <form onSubmit={runCommand}>
              <span>›_</span>
              <input
                ref={commandInput}
                aria-label="Command line"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Type a command"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="submit"
                title="Run command"
                aria-label="Run command"
              >
                ↵
              </button>
            </form>
          </div>
          {busy && (
            <div className="markup-busy" role="status">
              Processing drawing…
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="markup-error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      <footer className="markup-status">
        <div className="cad-model-tabs">
          <span className="active">Model</span>
          <span>
            {project.sheets.length}{" "}
            {project.sheets.length === 1 ? "sheet" : "sheets"}
          </span>
        </div>
        <span ref={coordinates} className="cad-coordinates">
          0.000, 0.000, 0.000
        </span>
        <div className="cad-status-tools">
          <span>MODEL</span>
          <button
            aria-label="Toggle grid"
            title="Grid display"
            aria-pressed={grid}
            className={grid ? "active" : ""}
            onClick={() => setGrid(!grid)}
          >
            <Grid2X2 size={15} />
          </button>
          <button
            aria-label="Toggle snap"
            title="Snap to 100 mm"
            aria-pressed={snap}
            className={snap ? "active" : ""}
            onClick={() => setSnap(!snap)}
          >
            <Crosshair size={15} />
          </button>
          <button
            aria-label="Ortho mode"
            title="Ortho (F8)"
            aria-pressed={ortho}
            className={ortho ? "active" : ""}
            onClick={() => setOrtho(!ortho)}
          >
            ORTHO
          </button>
          <button
            aria-label="Object snap"
            title="Object snap (F3)"
            aria-pressed={osnap}
            className={osnap ? "active" : ""}
            onClick={() => setOsnap(!osnap)}
            onContextMenu={(e) => openSnapMenu(e)}
          >
            OSNAP
          </button>
          <button
            aria-label="Object snap settings"
            title="Object snap settings"
            aria-expanded={snapMenu?.kind === "settings"}
            onClick={(e) => openSnapMenu(e)}
          >
            <ChevronDown size={12} />
          </button>
          <span>{Math.round(view.zoom * 100)}%</span>
          <span>{sheet.items.filter((i) => i.type === "bay").length} bays</span>
          <span>m</span>
        </div>
      </footer>
      {quickMenu && (
        <>
          <div
            className="cad-snap-backdrop"
            onPointerDown={() => setQuickMenu(null)}
          />
          <div
            className="cad-snap-menu cad-quick-menu"
            role="menu"
            aria-label="Drawing quick actions"
            style={{ left: quickMenu.x, top: quickMenu.y }}
          >
            <strong>
              {tool === "select"
                ? selected.length
                  ? `${selected.length} object${selected.length === 1 ? "" : "s"} selected`
                  : "Drawing actions"
                : `${tool.toUpperCase()} command`}
            </strong>
            {tool === "line" && (
              <>
                <button
                  role="menuitem"
                  onClick={() => contextAction(lineEnter)}
                >
                  Enter · finish line
                </button>
                <button
                  role="menuitem"
                  disabled={!lineIds.current.length}
                  onClick={() => contextAction(undoLine)}
                >
                  Undo last segment
                </button>
                <button
                  role="menuitem"
                  disabled={points.length < 3}
                  onClick={() => contextAction(() => finishLine(true))}
                >
                  Close line
                </button>
              </>
            )}
            {tool === "move" && moveSelecting && (
              <button
                role="menuitem"
                disabled={!selected.length}
                onClick={() => contextAction(confirmMoveSelection)}
              >
                Enter · finish selection
              </button>
            )}
            {tool !== "select" || selectionBox ? (
              <button
                role="menuitem"
                onClick={() => contextAction(() => changeTool("select"))}
              >
                Cancel command <kbd>Esc</kbd>
              </button>
            ) : (
              <button
                role="menuitem"
                onClick={() =>
                  contextAction(() =>
                    lastCommand.current === "move"
                      ? beginMove()
                      : changeTool(lastCommand.current),
                  )
                }
              >
                Repeat {lastCommand.current.toUpperCase()}
              </button>
            )}
            {tool === "select" && (
              <>
                <button
                  role="menuitem"
                  onClick={() => contextAction(beginMove)}
                >
                  <Move size={14} /> Move
                </button>
                <button
                  role="menuitem"
                  disabled={!selected.length}
                  onClick={() => contextAction(remove)}
                >
                  <Trash2 size={14} /> Erase
                </button>
                <button
                  role="menuitem"
                  disabled={selection?.type !== "bay"}
                  onClick={() => contextAction(rotate)}
                >
                  <RotateCw size={14} /> Rotate bay 90°
                </button>
                <button
                  role="menuitem"
                  onClick={() =>
                    contextAction(() => {
                      cancelDrag();
                      setSelected(sheet.items.map((i) => i.id));
                    })
                  }
                >
                  Select all
                </button>
                <button
                  role="menuitem"
                  disabled={!selected.length}
                  onClick={() =>
                    contextAction(() => {
                      cancelDrag();
                      setSelected([]);
                    })
                  }
                >
                  Deselect all
                </button>
              </>
            )}
            <div className="cad-menu-divider" />
            <button
              role="menuitem"
              onClick={() => {
                const pos = quickMenu;
                setQuickMenu(null);
                setSnapMenu({ ...pos, kind: "override" });
              }}
            >
              Snap overrides…
            </button>
            <button
              role="menuitem"
              onClick={() => {
                const pos = quickMenu;
                setQuickMenu(null);
                setSnapMenu({ ...pos, kind: "settings" });
              }}
            >
              Object snap settings…
            </button>
            {tool === "select" && (
              <>
                <div className="cad-menu-divider" />
                <button
                  role="menuitem"
                  onClick={() => contextAction(() => changeTool("pan"))}
                >
                  <Hand size={14} /> Pan
                </button>
                <button role="menuitem" onClick={() => contextAction(fit)}>
                  <Maximize size={14} /> Zoom extents
                </button>
                <button
                  role="menuitem"
                  disabled={!history.past.length}
                  onClick={() => contextAction(() => undo())}
                >
                  <Undo2 size={14} /> Undo
                </button>
                <button
                  role="menuitem"
                  disabled={!history.future.length}
                  onClick={() => contextAction(() => undo(true))}
                >
                  <Redo2 size={14} /> Redo
                </button>
              </>
            )}
          </div>
        </>
      )}
      {snapMenu && (
        <>
          <div
            className="cad-snap-backdrop"
            onPointerDown={() => setSnapMenu(null)}
          />
          <div
            className="cad-snap-menu"
            role="menu"
            aria-label={
              snapMenu.kind === "override"
                ? "Object snap overrides"
                : "Object snap settings"
            }
            style={{ left: snapMenu.x, top: snapMenu.y }}
          >
            <strong>
              {snapMenu.kind === "override"
                ? "Snap override · next point"
                : "Running object snaps"}
            </strong>
            {snapMenu.kind === "settings" && (
              <button
                role="menuitemcheckbox"
                aria-checked={osnap}
                onClick={() => setOsnap(!osnap)}
              >
                <span>{osnap ? "✓" : ""}</span>Object Snap On <kbd>F3</kbd>
              </button>
            )}
            {SNAP_MODES.map(([key, label, symbol]) => (
              <button
                key={key}
                role={
                  snapMenu.kind === "override" ? "menuitem" : "menuitemcheckbox"
                }
                aria-checked={
                  snapMenu.kind === "settings"
                    ? snapModes.includes(key)
                    : undefined
                }
                onClick={() => {
                  if (snapMenu.kind === "override") {
                    setSnapOverride(key);
                    setSnapCycle(0);
                    setSnapMenu(null);
                    canvas.current?.focus();
                  } else
                    setSnapModes((m) =>
                      m.includes(key)
                        ? m.filter((k) => k !== key)
                        : [...m, key],
                    );
                }}
              >
                <span className="cad-snap-symbol">
                  {snapMenu.kind === "settings" && snapModes.includes(key)
                    ? "✓"
                    : symbol}
                </span>
                {label}
              </button>
            ))}
            {snapMenu.kind === "override" && (
              <button
                role="menuitem"
                onClick={() => {
                  setSnapOverride("none");
                  setSnapMenu(null);
                  canvas.current?.focus();
                }}
              >
                <span>∅</span>None · next point
              </button>
            )}
            <small>
              Snaps to drawn lines and scaffold blocks. PDF underlays are
              images.
            </small>
            <button
              role="menuitem"
              onClick={() => {
                setSnapMenu(null);
                canvas.current?.focus();
              }}
            >
              Done
            </button>
          </div>
        </>
      )}
      <input
        ref={pdfInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={importPdf}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".essmarkup,.json"
        hidden
        onChange={openProject}
      />
    </div>
  );
}
