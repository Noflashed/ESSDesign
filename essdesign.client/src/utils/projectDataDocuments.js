import { getProjectDataStatus } from "./projectDataStatus";
import { getScaffTagStatus } from "./scaffTagStatus";
export const formatBytes = (value) => {
  if (!Number.isFinite(value)) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const makeFileRef = (prefix, index) =>
  `${prefix}-${String(index + 1).padStart(5, "0")}`;

const withPdfExtension = (value) => {
  const name =
    String(value || "Handover certificate").trim() || "Handover certificate";
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
};

export function mapScaffTagRows(items) {
  return items.map((item, index) => {
    const tagNo =
      item.scaffoldNo || item.tagNumber || makeFileRef("TAG", index);
    return {
      id: item.id,
      kind: "scaff-tags",
      name: `${tagNo}.pdf`,
      ref: tagNo,
      status: getScaffTagStatus(item),
      uploadedAt: item.updatedAt || item.latestInspectionDate || "",
      expiresAt: item.retiredAt || item.dismantledAt || "",
      uploadedBy: item.inspectedBy || item.competentPerson || "Site team",
      location: item.jobLocation || "",
      size: formatBytes(item.size),
      raw: item,
    };
  });
}

export function mapHandoverRows(items) {
  return items.map((item, index) => {
    const ref =
      item.inspectionNumber ||
      item.formReferenceName ||
      makeFileRef("HOC", index);
    return {
      id: item.id,
      kind: "handover-certificates",
      name: withPdfExtension(
        item.formReferenceName || `Handover certificate ${ref}`,
      ),
      ref,
      status: getProjectDataStatus(item),
      uploadedAt: item.updatedAt || item.inspectionDateTime || "",
      expiresAt: "",
      uploadedBy: item.essRepresentativeName || "Site team",
      location: item.projectNumberClient || "",
      size: formatBytes(item.size),
      raw: item,
    };
  });
}

export function mapDayLabourVariationRows(items) {
  return items.map((item, index) => {
    const ref =
      item.variationNumber ||
      item.formReferenceName ||
      makeFileRef("DLV", index);
    const title = item.formReferenceName || `Day Labour/Variation ${ref}`;
    return {
      id: item.id,
      kind: "day-labour-variations",
      name: withPdfExtension(title),
      ref,
      status: getProjectDataStatus(item),
      uploadedAt: item.updatedAt || item.date || "",
      expiresAt: "",
      uploadedBy: item.createdByName || "Not recorded",
      location: item.clientProjectName || item.handoverDocumentTitle || "",
      size: formatBytes(item.size),
      raw: item,
    };
  });
}

export function mapPreStartRows(items) {
  return items.map((item) => ({
    id: item.id,
    kind: "pre-starts",
    name: withPdfExtension(
      item.subject || `Daily Pre-Start ${item.preStartNumber}`,
    ),
    ref: item.preStartNumber || "-",
    status: getProjectDataStatus(item),
    uploadedAt: item.updatedAt || "",
    expiresAt: "",
    uploadedBy: item.representativeName || "Site team",
    location: item.clientProjectName || "",
    size: formatBytes(item.size),
    raw: item,
  }));
}
