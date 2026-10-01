export const BAY_SIZES = [1.2, 1.8, 2.4, 3];
export const emptySheet = () => ({
  id: crypto.randomUUID(),
  name: "Blank drawing",
  width: 1400,
  height: 900,
  image: null,
  pixelsPerMetre: 100,
  calibrated: true,
  items: [],
});
export function referenceScale(a, b, metres) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  if (!Number.isFinite(metres) || metres <= 0 || distance < 2)
    throw new Error(
      "Choose two distinct points and enter a positive reference length.",
    );
  const scale = distance / metres;
  if (!Number.isFinite(scale) || scale < 0.01 || scale > 1e7)
    throw new Error("Reference length is outside the supported drawing range.");
  return scale;
}
export function itemSize(item, scale) {
  return item.type === "bay"
    ? {
        w: (item.rotation % 180 ? item.depth : item.length) * scale,
        h: (item.rotation % 180 ? item.length : item.depth) * scale,
      }
    : { w: 0, h: 0 };
}
export function hitItem(item, point, scale, tolerance) {
  if (item.type === "bay") {
    const { w, h } = itemSize(item, scale);
    return (
      point.x >= item.x &&
      point.x <= item.x + w &&
      point.y >= item.y &&
      point.y <= item.y + h
    );
  }
  if (item.type === "note")
    return (
      point.x >= item.x - tolerance &&
      point.x <= item.x + item.text.length * 8 + tolerance &&
      Math.abs(point.y - item.y) < 18 + tolerance
    );
  const dx = item.x2 - item.x,
    dy = item.y2 - item.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - item.x) * dx + (point.y - item.y) * dy) /
        (dx * dx + dy * dy || 1),
    ),
  );
  return (
    Math.hypot(point.x - item.x - t * dx, point.y - item.y - t * dy) <=
    tolerance
  );
}
export function validateProject(value) {
  if (
    value?.version !== 1 ||
    typeof value.title !== "string" ||
    !Array.isArray(value.sheets) ||
    !value.sheets.length ||
    value.sheets.length > 30
  )
    throw new Error("This is not a supported ESS Markup file.");
  const finite = (n) => Number.isFinite(n) && Math.abs(n) <= 1e7;
  for (const sheet of value.sheets) {
    if (
      typeof sheet.id !== "string" ||
      typeof sheet.name !== "string" ||
      !finite(sheet.width) ||
      !finite(sheet.height) ||
      sheet.width <= 0 ||
      sheet.height <= 0 ||
      sheet.width > 5000 ||
      sheet.height > 5000 ||
      !finite(sheet.pixelsPerMetre) ||
      sheet.pixelsPerMetre <= 0 ||
      typeof sheet.calibrated !== "boolean" ||
      !Array.isArray(sheet.items) ||
      sheet.items.length > 10000 ||
      (sheet.image !== null &&
        (typeof sheet.image !== "string" ||
          !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sheet.image)))
    )
      throw new Error("Invalid drawing sheet.");
    for (const item of sheet.items) {
      if (
        typeof item.id !== "string" ||
        !finite(item.x) ||
        !finite(item.y) ||
        !["bay", "line", "note"].includes(item.type)
      )
        throw new Error("Invalid drawing object.");
      if (
        item.type === "bay" &&
        (![item.length, item.depth].every(
          (n) => finite(n) && n > 0 && n <= 100,
        ) ||
          ![0, 90, 180, 270].includes(item.rotation))
      )
        throw new Error("Invalid scaffold bay.");
      if (item.type === "line" && ![item.x2, item.y2].every(finite))
        throw new Error("Invalid line.");
      if (
        item.type === "note" &&
        (typeof item.text !== "string" || item.text.length > 500)
      )
        throw new Error("Invalid note.");
    }
  }
  return value;
}
export function drawSheet(
  ctx,
  sheet,
  background,
  selected = null,
  modelSpace = false,
) {
  ctx.fillStyle = "#fff";
  if (!modelSpace) ctx.fillRect(0, 0, sheet.width, sheet.height);
  if (background) ctx.drawImage(background, 0, 0, sheet.width, sheet.height);
  for (const item of sheet.items) {
    ctx.save();
    ctx.strokeStyle = (
      selected instanceof Set ? selected.has(item.id) : item.id === selected
    )
      ? "#75baff"
      : modelSpace
        ? "#d6dce0"
        : "#007c83";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    if (item.type === "bay") {
      const { w, h } = itemSize(item, sheet.pixelsPerMetre);
      ctx.fillStyle = modelSpace
        ? "rgba(180, 200, 220, .025)"
        : "rgba(0, 156, 166, .14)";
      ctx.fillRect(item.x, item.y, w, h);
      ctx.strokeRect(item.x, item.y, w, h);
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(item.x + w, item.y + h);
      ctx.moveTo(item.x + w, item.y);
      ctx.lineTo(item.x, item.y + h);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      for (const [x, y] of [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ]) {
        ctx.beginPath();
        ctx.arc(item.x + x, item.y + y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = `${Math.max(7, Math.min(13, w / 10))}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText(
        `${item.length} × ${item.depth} m`,
        item.x + w / 2,
        item.y + h / 2 - 5,
      );
    } else if (item.type === "line") {
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(item.x2, item.y2);
      ctx.stroke();
    } else {
      ctx.font = "16px Arial";
      ctx.fillText(item.text, item.x, item.y);
    }
    ctx.restore();
  }
}
