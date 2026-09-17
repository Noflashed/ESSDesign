import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  Plus,
  Search,
  X,
  SlidersHorizontal,
  Download,
  MoreVertical,
  ArrowUpRight,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowDown,
  Check,
  Minus,
} from "lucide-react";
import { zipSync } from "fflate";
import {
  usersAPI,
  resolveProfileImageUrls,
  safetyProjectsAPI,
  scaffTagsAPI,
  handoverCertificatesAPI,
  dayLabourVariationsAPI,
  preStartsAPI,
} from "../services/api";
import {
  mapScaffTagRows,
  mapHandoverRows,
  mapDayLabourVariationRows,
  mapPreStartRows,
} from "../utils/projectDataDocuments";
import {
  ALL_SCOPE,
  ALL_BUILDERS,
  projectScopeOptions,
  resolveProjectScope,
  matchesProjectScope,
} from "../utils/projectDataScope";
import { isFormShared } from "../utils/projectDataStatus";
import { normalizeCompanyEntityId } from "../scaffoldForms/config/companyEntities";
import { RegisterDropdown } from "./ScaffoldRegisterPage";
import ScaffoldFormEditor from "./ScaffoldFormEditor";
import LoadingBrandmark from "./LoadingBrandmark";
import "./ProjectFilesPage.css";
import "./ProjectFilesTypography.css";
import "./ProjectFilesPolish.css";

const TYPES = [
  {
    key: "scaff-tags",
    label: "Scaff-tags",
    api: scaffTagsAPI,
    map: mapScaffTagRows,
  },
  {
    key: "handover-certificates",
    label: "Handovers",
    api: handoverCertificatesAPI,
    map: mapHandoverRows,
  },
  {
    key: "day-labour-variations",
    label: "Day Labour / Variations",
    api: dayLabourVariationsAPI,
    map: mapDayLabourVariationRows,
  },
  {
    key: "pre-starts",
    label: "Pre-starts",
    api: preStartsAPI,
    map: mapPreStartRows,
  },
];
const PAGE_SIZE = 7;
const dateText = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};
const time = (value) => {
  const n = Date.parse(value);
  return Number.isNaN(n) ? 0 : n;
};
const fileName = (doc) =>
  `${doc.ref}-${doc.name}`
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/(?:\.pdf)?$/i, ".pdf");
function ProfileAvatar({ name, src }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className="pf-avatar">
      {src && !failed ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        name
          .split(" ")
          .slice(0, 2)
          .map((word) => word[0])
          .join("")
      )}
    </span>
  );
}
const BADGE_DESCRIPTIONS = {
  Active: "The scaffold is currently erected and on-site.",
  Shared: "This form has been shared with an internal or external user.",
  "Form Shared": "This form has been shared with an internal or external user.",
  "Not shared": "This form has not been shared with an internal or external user.",
  "Not Shared": "This form has not been shared with an internal or external user.",
};

function Badge({ value }) {
  const description = BADGE_DESCRIPTIONS[value];
  const tooltipId = useId();
  const [position, setPosition] = useState(null);
  const showTooltip = (event) => {
    if (!description) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - 24);
    setPosition({
      left: Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12)),
      top: rect.top > 90 ? rect.top - 8 : rect.bottom + 8,
      above: rect.top > 90,
      width,
    });
  };
  useEffect(() => {
    if (!position) return undefined;
    const close = () => setPosition(null);
    const onKeyDown = (event) => { if (event.key === "Escape") close(); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [position]);
  return (
    <>
    <span
      className={`pf-badge pf-${String(value).toLowerCase().replaceAll(" ", "-")}`}
      tabIndex={description ? 0 : undefined}
      aria-describedby={position ? tooltipId : undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={() => setPosition(null)}
      onFocus={showTooltip}
      onBlur={() => setPosition(null)}
    >
      {["Active", "Current", "Shared"].includes(value) ? (
        <Check size={12} />
      ) : (
        <Minus size={12} />
      )}{" "}
      {value}
    </span>
    {position && createPortal(
      <span id={tooltipId} role="tooltip" className="pf-badge-tooltip"
        style={{ left: position.left, top: position.top, width: position.width,
          transform: position.above ? "translateY(-100%)" : undefined }}>
        {description}
      </span>, document.body,
    )}
    </>
  );
}
function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus?.();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="pf-modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}

export default function ESSSafetyPage() {
  const [builders, setBuilders] = useState([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [builderId, setBuilderId] = useState(ALL_SCOPE),
    [projectId, setProjectId] = useState(ALL_SCOPE),
    [kind, setKind] = useState("scaff-tags");
  const [documents, setDocuments] = useState([]),
    [reload, setReload] = useState(0);
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [sharing, setSharing] = useState("all"),
    [uploader, setUploader] = useState("all"),
    [newest, setNewest] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false),
    [page, setPage] = useState(1),
    [checked, setChecked] = useState([]),
    [menu, setMenu] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null),
    [deleting, setDeleting] = useState(false),
    [downloading, setDownloading] = useState(false);
  const [createKind, setCreateKind] = useState(null),
    [createBuilder, setCreateBuilder] = useState(""),
    [createProject, setCreateProject] = useState(""),
    [editor, setEditor] = useState(null);
  const rootRef = useRef(null),
    tableRef = useRef(null),
    filterRef = useRef(null),
    menuRef = useRef(null),
    menuTrigger = useRef(null);
  const [height, setHeight] = useState(700),
    [tableHeight, setTableHeight] = useState(350);
  useEffect(() => {
    let active = true;
    safetyProjectsAPI
      .getBuilders()
      .then((value) => {
        if (active) setBuilders(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [profileUsers, setProfileUsers] = useState([]);
  const [profileImages, setProfileImages] = useState({});
  useEffect(() => {
    let active = true;
    usersAPI
      .getNotificationRecipients()
      .then((users) => {
        if (active) setProfileUsers(users);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const profileUser = (doc) => {
    const matches = profileUsers.filter((user) =>
      doc.kind === "day-labour-variations"
        ? user.id === doc.raw.createdByUserId
        : user.fullName?.trim().toLowerCase() ===
          doc.uploadedBy.trim().toLowerCase(),
    );
    return matches.length === 1 ? matches[0] : null;
  };
  useEffect(() => {
    let active = true;
    const ids = documents
      .map((doc) =>
        doc.kind === "day-labour-variations"
          ? doc.raw.createdByUserId
          : profileUser(doc)?.id,
      )
      .filter(Boolean);
    resolveProfileImageUrls(ids)
      .then((images) => {
        if (active) setProfileImages(images);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [documents, profileUsers]);
  const profileImage = (doc) => {
    const user = profileUser(doc);
    return (
      profileImages[
        doc.kind === "day-labour-variations"
          ? doc.raw.createdByUserId
          : user?.id
      ] ||
      user?.profileImageUrl ||
      user?.avatarUrl ||
      user?.picture ||
      ""
    );
  };
  const [builderLogos, setBuilderLogos] = useState({});
  useEffect(() => {
    let active = true;
    Promise.all(
      builders
        .filter((item) => item.logoPath || item.logoUrl || item.logo_url)
        .map(async (item) => {
          try {
            return [
              item.id,
              await safetyProjectsAPI.resolveBuilderLogoUrl(item),
            ];
          } catch {
            return [item.id, item.logoUrl || item.logo_url || ""];
          }
        }),
    ).then((entries) => {
      if (active) setBuilderLogos(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [builders]);
  const projects = useMemo(
    () => projectScopeOptions(builders, builderId),
    [builders, builderId],
  );
  const selectedProject = projects.find((item) => item.id === projectId);
  const scopeProjects = useMemo(
    () =>
      builders.flatMap((builder) =>
        (builder.projects || [])
          .filter((project) =>
            matchesProjectScope(
              { builderId: builder.id, projectId: project.id },
              builderId,
              selectedProject,
            ),
          )
          .map((project) => ({ builder, project })),
      ),
    [builders, builderId, selectedProject],
  );
  useEffect(() => {
    let active = true;
    if (loading) return;
    setBusy(true);
    setError("");
    setDocuments([]);
    const attach = (doc, context) => ({
      ...doc,
      recordId: doc.id,
      id: JSON.stringify([
        context.builder.id,
        context.project.id,
        doc.kind,
        doc.id,
      ]),
      builderId: context.builder.id,
      projectId: context.project.id,
      ...context,
    });
    const contexts = new Map(
      scopeProjects.map((context) => [
        JSON.stringify([context.builder.id, context.project.id]),
        context,
      ]),
    );
    Promise.allSettled(
      TYPES.map(async (type) => {
        if (!scopeProjects.length) return [];
        if (scopeProjects.length === 1) {
          const context = scopeProjects[0];
          return type
            .map(
              await type.api.listForms(context.builder.id, context.project.id),
            )
            .map((doc) => attach(doc, context));
        }
        return type.map(await type.api.listAllForms()).flatMap((doc) => {
          const context = contexts.get(
            JSON.stringify([doc.raw.builderId, doc.raw.projectId]),
          );
          return context ? [attach(doc, context)] : [];
        });
      }),
    ).then((results) => {
      if (!active) return;
      setDocuments(
        results.flatMap((result) =>
          result.status === "fulfilled" ? result.value : [],
        ),
      );
      const failed = results.flatMap((result, index) =>
        result.status === "rejected" ? [TYPES[index].label] : [],
      );
      if (failed.length)
        setError(
          `Could not load ${failed.join(", ")}. Please refresh to retry.`,
        );
      setBusy(false);
      setInitialLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [scopeProjects, reload, loading]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        setReload((value) => value + 1);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    setPage(1);
    setChecked([]);
    setMenu(null);
  }, [builderId, projectId, kind, query, status, sharing, uploader]);
  useEffect(() => {
    const resize = () => {
      if (rootRef.current)
        setHeight(
          Math.max(
            320,
            window.innerHeight - rootRef.current.getBoundingClientRect().top,
          ),
        );
    };
    resize();
    window.addEventListener("resize", resize);
    const observer = new ResizeObserver(() => {
      resize();
      if (tableRef.current) setTableHeight(tableRef.current.clientHeight);
    });
    if (rootRef.current) observer.observe(rootRef.current);
    if (tableRef.current) observer.observe(tableRef.current);
    return () => {
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, [loading, initialLoaded]);
  useEffect(() => {
    const dismiss = (e) => {
      if (!filterRef.current?.contains(e.target)) setFiltersOpen(false);
      if (
        !menuRef.current?.contains(e.target) &&
        !e.target.closest(".pf-row-actions")
      )
        setMenu(null);
    };
    const escape = (e) => {
      if (e.key === "Escape") {
        setFiltersOpen(false);
        setMenu(null);
        menuTrigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (menu) menuRef.current?.querySelector("button")?.focus();
  }, [menu]);
  const hasStatus = ["scaff-tags", "handover-certificates"].includes(kind);
  const currentDocuments = documents.filter((doc) => doc.kind === kind);
  const filtered = currentDocuments
    .filter(
      (doc) =>
        (!query ||
          `${doc.name} ${doc.ref} ${doc.builder.name} ${doc.project.name}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (status === "all" || doc.status === status) &&
        (sharing === "all" || String(isFormShared(doc.raw)) === sharing) &&
        (uploader === "all" || doc.uploadedBy === uploader),
    )
    .sort(
      (a, b) => (time(b.uploadedAt) - time(a.uploadedAt)) * (newest ? 1 : -1),
    );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    currentPage = Math.min(page, totalPages),
    pageRows = filtered.slice(
      (currentPage - 1) * PAGE_SIZE,
      currentPage * PAGE_SIZE,
    );
  const selectedRows = filtered.filter((doc) => checked.includes(doc.id)),
    allChecked =
      pageRows.length > 0 && pageRows.every((doc) => checked.includes(doc.id));
  const recent = [...documents]
    .sort(
      (a, b) =>
        time(b.raw.updatedAt || b.uploadedAt) -
        time(a.raw.updatedAt || a.uploadedAt),
    )
    .slice(0, 3);
  const filteredOn =
    query || status !== "all" || sharing !== "all" || uploader !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setSharing("all");
    setUploader("all");
  };
  const changeKind = (next) => {
    setKind(next);
    clearFilters();
  };
  const toggle = (id) =>
    setChecked((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  const resolvePdf = useCallback(async (doc) => {
    const api = TYPES.find((type) => type.key === doc.kind).api;
    const form = await api.getForm(doc.builderId, doc.projectId, doc.recordId);
    if (!form) throw new Error("This form is no longer available.");
    const url = await api.getPdfUrl(form);
    if (!url)
      throw new Error(
        "The PDF is not available yet. Open the form and generate its PDF first.",
      );
    return url;
  }, []);
  const openPdf = async (doc) => {
    setMenu(null);
    const popup = window.open("about:blank", "_blank");
    if (popup) {
      popup.opener = null;
      popup.document.title = "Loading PDF…";
    }
    try {
      const url = await resolvePdf(doc);
      if (popup) popup.location.replace(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      popup?.close();
      setError(e.message);
    }
  };
  const download = async (rows) => {
    if (downloading || !rows.length) return;
    setDownloading(true);
    setMenu(null);
    setError("");
    try {
      const files = [];
      for (const doc of rows) {
        const response = await fetch(await resolvePdf(doc));
        if (!response.ok) throw new Error(`Could not download ${doc.name}.`);
        files.push({
          doc,
          bytes: new Uint8Array(await response.arrayBuffer()),
        });
      }
      const blob =
        files.length === 1
          ? new Blob([files[0].bytes], { type: "application/pdf" })
          : new Blob(
              [
                zipSync(
                  Object.fromEntries(
                    files.map(({ doc, bytes }, i) => [
                      `${i + 1}-${fileName(doc)}`,
                      bytes,
                    ]),
                  ),
                ),
              ],
              { type: "application/zip" },
            );
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download =
        files.length === 1 ? fileName(files[0].doc) : "project-documents.zip";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  };
  const openMenu = (doc, e) => {
    e.preventDefault();
    e.stopPropagation();
    menuTrigger.current = e.currentTarget;
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({
      doc,
      x: Math.max(
        8,
        Math.min(e.clientX || rect.right, window.innerWidth - 230),
      ),
      y: Math.max(
        8,
        Math.min(e.clientY || rect.bottom, window.innerHeight - 250),
      ),
    });
  };
  const deleteDocument = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      const doc = pendingDelete;
      await TYPES.find((type) => type.key === doc.kind).api.deleteForm(
        doc.builderId,
        doc.projectId,
        doc.recordId,
      );
      setDocuments((rows) => rows.filter((row) => row.id !== doc.id));
      setChecked((ids) => ids.filter((id) => id !== doc.id));
      setPendingDelete(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };
  const launchEditor = (type, builder, project) => {
    setCreateKind(null);
    setEditor({
      screen: type === "pre-starts" ? "PreStartForm" : "DayLabourVariationForm",
      params: {
        builderId: builder.id,
        builderName: builder.name,
        projectId: project.id,
        projectName: project.name,
        initialCompanyEntityId: normalizeCompanyEntityId(
          project.scaffoldEntity,
        ),
      },
    });
    changeKind(type);
  };
  const newDocument = (type) => {
    const context = scopeProjects.length === 1 ? scopeProjects[0] : null;
    if (context) {
      launchEditor(type, context.builder, context.project);
      return;
    }
    setCreateKind(type);
    setCreateBuilder(builderId === ALL_SCOPE ? "" : builderId);
    setCreateProject("");
  };
  const closeEditor = () => {
    setEditor(null);
    setReload((value) => value + 1);
  };
  const pageNumbers = [
    ...new Set([
      1,
      ...Array.from({ length: 5 }, (_, i) => currentPage - 2 + i).filter(
        (value) => value > 1 && value < totalPages,
      ),
      totalPages,
    ]),
  ].sort((a, b) => a - b);
  if (loading || !initialLoaded)
    return (
      <div ref={rootRef} className="pf-initial-loading" style={{ height }}>
        <LoadingBrandmark label="Loading project data" />
      </div>
    );
  return (
    <main
      ref={rootRef}
      className="project-files-page"
      style={{
        height,
        "--pf-row": `${Math.max(12, (tableHeight - 32) / PAGE_SIZE)}px`,
        "--pf-scale": Math.min(
          1,
          Math.max(0.5, (tableHeight - 32) / PAGE_SIZE / 60),
        ),
      }}
    >
      <div className="pf-create-cards">
        {[
          ["day-labour-variations", "New Day Labour/Variation"],
          ["pre-starts", "New Pre-Start"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => newDocument(key)}
            className="pf-create-card"
          >
            <span>
              <FileText size={19} />
            </span>
            <Plus size={16} />
            <strong>{label}</strong>
          </button>
        ))}
      </div>
      <section className="pf-recent" aria-label="Recently modified">
        <h2>Recently modified</h2>
        <div>
          {recent.map((doc) => (
            <button
              key={doc.id}
              onClick={() => openPdf(doc)}
              className="pf-recent-card"
            >
              <FileText size={20} />
              <span>
                <strong title={doc.name}>{doc.name}</strong>
                <small>
                  {TYPES.find((type) => type.key === doc.kind).label}
                </small>
                <small
                  title={`Client: ${doc.builder.name} · Project: ${doc.project.name}`}
                >
                  {doc.builder.name} · {doc.project.name}
                </small>
              </span>
            </button>
          ))}
          {!recent.length && (
            <p>
              {busy
                ? "Loading recently modified forms…"
                : "No forms in this project selection yet."}
            </p>
          )}
        </div>
      </section>
      {error && (
        <div className="pf-error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <section className="pf-panel">
        <div className="pf-toolbar">
          <nav className="pf-tabs" aria-label="Document type">
            {TYPES.map((type) => (
              <button
                key={type.key}
                aria-pressed={kind === type.key}
                onClick={() => changeKind(type.key)}
              >
                {type.label}
              </button>
            ))}
          </nav>
          <div className="pf-scope">
            <RegisterDropdown
              label="Builder"
              selectedItem={[ALL_BUILDERS, ...builders].find(
                (item) => item.id === builderId,
              )}
              items={[ALL_BUILDERS, ...builders]}
              getLabel={(item) => item.name}
              getLogoUrl={(item) =>
                item.isAll
                  ? ""
                  : builderLogos[item.id] || item.logoUrl || item.logo_url || ""
              }
              onSelect={(item) => {
                const scope = resolveProjectScope(builders, {
                  builderId: item.id,
                  projectId: ALL_SCOPE,
                });
                setBuilderId(scope.builderId);
                setProjectId(scope.projectId);
              }}
            />
            <RegisterDropdown
              label="Project"
              selectedItem={selectedProject}
              items={projects}
              getLabel={(item) => item.name}
              getLogoName={(item) =>
                builders.find((builder) => builder.id === item.builderId)
                  ?.name || item.name
              }
              getLogoUrl={(item) =>
                builderLogos[item.builderId] ||
                builders.find((builder) => builder.id === item.builderId)
                  ?.logoUrl ||
                ""
              }
              onSelect={(item) => setProjectId(item.id)}
            />
          </div>
          <label className="pf-search">
            <Search size={16} />
            <input
              aria-label="Search documents"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={14} />
              </button>
            )}
          </label>
          <div className="pf-filter-anchor" ref={filterRef}>
            <button
              className="pf-filter-button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal size={15} />
              Filters
              {[status, sharing, uploader].filter((value) => value !== "all")
                .length > 0 && (
                <b>
                  {
                    [status, sharing, uploader].filter(
                      (value) => value !== "all",
                    ).length
                  }
                </b>
              )}
            </button>
            {filtersOpen && (
              <div className="pf-filter-popover">
                <strong>Filter documents</strong>
                {hasStatus && (
                  <label>
                    Status
                    <select
                      aria-label="Status filter"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      {[
                        ...new Set(currentDocuments.map((doc) => doc.status)),
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Form Shared
                  <select
                    aria-label="Form Shared filter"
                    value={sharing}
                    onChange={(e) => setSharing(e.target.value)}
                  >
                    <option value="all">All forms</option>
                    <option value="true">Shared</option>
                    <option value="false">Not shared</option>
                  </select>
                </label>
                <label>
                  Uploaded by
                  <select
                    aria-label="Uploaded by filter"
                    value={uploader}
                    onChange={(e) => setUploader(e.target.value)}
                  >
                    <option value="all">All uploaders</option>
                    {[...new Set(currentDocuments.map((doc) => doc.uploadedBy))]
                      .sort()
                      .map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                  </select>
                </label>
                <footer>
                  <button onClick={clearFilters}>Reset filters</button>
                  <button onClick={() => setFiltersOpen(false)}>Done</button>
                </footer>
              </div>
            )}
          </div>
        </div>
        {filteredOn && (
          <div className="pf-filter-summary">
            <span>{filtered.length} matching documents</span>
            {query && <span>“{query}”</span>}
            {status !== "all" && <span>{status}</span>}
            {sharing !== "all" && (
              <span>{sharing === "true" ? "Shared" : "Not shared"}</span>
            )}
            {uploader !== "all" && <span>{uploader}</span>}
            <button onClick={clearFilters}>Clear filters</button>
          </div>
        )}
        {selectedRows.length > 0 && (
          <div className="pf-selection">
            <strong>{selectedRows.length} selected</strong>
            <button
              disabled={downloading}
              onClick={() => download(selectedRows)}
            >
              <Download size={14} />
              {downloading ? "Downloading…" : "Download selected"}
            </button>
            <button onClick={() => setChecked([])}>Clear selection</button>
          </div>
        )}
        <div className="pf-table-area" ref={tableRef} aria-busy={busy}>
          <table className={hasStatus ? "pf-with-status" : "pf-without-status"}>
            <thead>
              <tr>
                <th>
                  <div className="pf-file">
                    <input
                      type="checkbox"
                      aria-label="Select all files on this page"
                      checked={allChecked}
                      ref={(element) => {
                        if (element)
                          element.indeterminate =
                            !allChecked &&
                            pageRows.some((doc) => checked.includes(doc.id));
                      }}
                      onChange={() =>
                        setChecked((ids) =>
                          allChecked
                            ? ids.filter(
                                (id) => !pageRows.some((doc) => doc.id === id),
                              )
                            : [
                                ...new Set([
                                  ...ids,
                                  ...pageRows.map((doc) => doc.id),
                                ]),
                              ],
                        )
                      }
                    />
                    <span>Document / reference</span>
                  </div>
                </th>
                <th>
                  <button
                    onClick={() => {
                      setNewest(!newest);
                      setPage(1);
                    }}
                  >
                    Uploaded{" "}
                    <ArrowDown
                      size={12}
                      style={{ transform: newest ? "none" : "rotate(180deg)" }}
                    />
                  </button>
                </th>
                <th>Uploaded by</th>
                <th>Form Shared</th>
                {hasStatus && <th>Status</th>}
                <th>
                  <span className="pf-sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((doc) => (
                <tr
                  key={doc.id}
                  className={`pf-table-row ${checked.includes(doc.id) ? "pf-selected" : ""}`}
                  onClick={() => openPdf(doc)}
                  onContextMenu={(e) => openMenu(doc, e)}
                >
                  <td>
                    <div className="pf-file">
                      <input
                        type="checkbox"
                        aria-label={`Select ${doc.name}`}
                        checked={checked.includes(doc.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggle(doc.id)}
                      />
                      <button
                        className="pf-document"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPdf(doc);
                        }}
                      >
                        <span className="pf-file-icon">
                          <FileText size={20} />
                        </span>
                        <span>
                          <strong title={doc.name}>{doc.name}</strong>
                          <small title={`${doc.ref} · ${doc.project.name}`}>
                            {doc.ref}
                            {selectedProject?.isAll
                              ? ` · ${doc.project.name}`
                              : ""}
                          </small>
                        </span>
                      </button>
                    </div>
                  </td>
                  <td>{dateText(doc.uploadedAt)}</td>
                  <td>
                    <span className="pf-person">
                      <ProfileAvatar
                        name={doc.uploadedBy}
                        src={profileImage(doc)}
                      />
                      <span title={doc.uploadedBy}>{doc.uploadedBy}</span>
                    </span>
                  </td>
                  <td>
                    <Badge
                      value={isFormShared(doc.raw) ? "Shared" : "Not shared"}
                    />
                  </td>
                  {hasStatus && (
                    <td>
                      <Badge value={doc.status} />
                    </td>
                  )}
                  <td>
                    <button
                      className="pf-row-actions"
                      aria-label={`Open actions for ${doc.name}`}
                      onClick={(e) => openMenu(doc, e)}
                    >
                      <MoreVertical size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!pageRows.length && (
            <div className="pf-empty">
              {busy ? (
                <span role="status">Updating documents...</span>
              ) : (
                <>
                  <FileText size={28} />
                  <strong>
                    {filteredOn
                      ? "No documents match these filters"
                      : "No documents in this selection yet"}
                  </strong>
                  {filteredOn && (
                    <button onClick={clearFilters}>Clear filters</button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <footer className="pf-pagination">
          <span aria-live="polite">
            Page {currentPage} of {totalPages}
          </span>
          <nav aria-label="Page numbers">
            {pageNumbers.map((number, index) => (
              <React.Fragment key={number}>
                {index > 0 && number > pageNumbers[index - 1] + 1 && (
                  <span>…</span>
                )}
                <button
                  aria-label={`Page ${number}`}
                  aria-current={number === currentPage ? "page" : undefined}
                  onClick={() => setPage(number)}
                >
                  {number}
                </button>
              </React.Fragment>
            ))}
          </nav>
          <nav className="pf-arrows" aria-label="Document pages">
            <button
              aria-label="First page"
              disabled={currentPage === 1}
              onClick={() => setPage(1)}
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label="Next page"
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={16} />
            </button>
            <button
              aria-label="Last page"
              disabled={currentPage === totalPages}
              onClick={() => setPage(totalPages)}
            >
              <ChevronsRight size={16} />
            </button>
          </nav>
        </footer>
      </section>
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            className="pf-context-menu"
            role="menu"
            aria-label={`Actions for ${menu.doc.name}`}
            style={{ left: menu.x, top: menu.y }}
            onKeyDown={(e) => {
              if (["ArrowDown", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                const buttons = [
                    ...e.currentTarget.querySelectorAll(
                      "button:not(:disabled)",
                    ),
                  ],
                  i = buttons.indexOf(document.activeElement);
                buttons[
                  (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                    buttons.length
                ]?.focus();
              }
            }}
          >
            <button role="menuitem" onClick={() => openPdf(menu.doc)}>
              <ArrowUpRight size={15} />
              Open PDF
            </button>
            <button
              role="menuitem"
              disabled={downloading}
              onClick={() => download([menu.doc])}
            >
              <Download size={15} />
              Download PDF
            </button>
            {checked.includes(menu.doc.id) && selectedRows.length > 1 && (
              <button
                role="menuitem"
                disabled={downloading}
                onClick={() => download(selectedRows)}
              >
                <Download size={15} />
                Download selected ({selectedRows.length})
              </button>
            )}
            <button
              role="menuitem"
              onClick={() => {
                toggle(menu.doc.id);
                setMenu(null);
              }}
            >
              {checked.includes(menu.doc.id) ? "Deselect file" : "Select file"}
            </button>
            <button
              role="menuitem"
              className="pf-danger"
              onClick={() => {
                setPendingDelete(menu.doc);
                setMenu(null);
              }}
            >
              <Trash2 size={15} />
              Delete PDF
            </button>
          </div>,
          document.body,
        )}
      {pendingDelete && (
        <Modal
          title="Delete Project Data PDF?"
          onClose={() => {
            if (!deleting) setPendingDelete(null);
          }}
        >
          <p>
            This will permanently delete <strong>{pendingDelete.name}</strong>{" "}
            from {pendingDelete.project.name}.
          </p>
          <p>This cannot be undone.</p>
          {error && <p role="alert">{error}</p>}
          <footer>
            <button disabled={deleting} onClick={() => setPendingDelete(null)}>
              Cancel
            </button>
            <button
              className="pf-danger"
              disabled={deleting}
              onClick={deleteDocument}
            >
              {deleting ? "Deleting…" : "Delete PDF"}
            </button>
          </footer>
        </Modal>
      )}
      {createKind && (
        <Modal
          title={
            createKind === "pre-starts"
              ? "New Pre-Start"
              : "New Day Labour/Variation"
          }
          onClose={() => setCreateKind(null)}
        >
          <p>Select the client and project for this form.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const builder = builders.find(
                  (item) => item.id === createBuilder,
                ),
                project = builder?.projects.find(
                  (item) => item.id === createProject,
                );
              if (project) launchEditor(createKind, builder, project);
            }}
          >
            <label>
              Builder
              <select
                required
                aria-label="New document builder"
                value={createBuilder}
                onChange={(e) => {
                  setCreateBuilder(e.target.value);
                  setCreateProject("");
                }}
              >
                <option value="">Select builder</option>
                {builders.map((builder) => (
                  <option key={builder.id} value={builder.id}>
                    {builder.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Project
              <select
                required
                aria-label="New document project"
                value={createProject}
                onChange={(e) => setCreateProject(e.target.value)}
              >
                <option value="">Select project</option>
                {(
                  builders.find((builder) => builder.id === createBuilder)
                    ?.projects || []
                ).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <footer>
              <button type="button" onClick={() => setCreateKind(null)}>
                Cancel
              </button>
              <button type="submit" disabled={!createProject}>
                Continue
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {editor && (
        <ScaffoldFormEditor
          screen={editor.screen}
          params={editor.params}
          onClose={closeEditor}
          onSaved={() => setReload((value) => value + 1)}
        />
      )}
    </main>
  );
}
