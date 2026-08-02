import "./style.css";
import { SomakineCatalog, type RegionId, type StructureId, type StructureType } from "@somakine/core";
import { createSomakine, type InteractionMode, type ViewerSelection } from "@somakine/viewer";
import { bodyParts3DMusculoskeletal } from "@somakine/bodyparts3d-musculoskeletal";

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.textContent = `Somakine failed to start: ${message}`;
});

async function main(): Promise<void> {
const catalog = new SomakineCatalog(bodyParts3DMusculoskeletal);
const viewerHost = required<HTMLElement>("viewer");
const localeSelect = required<HTMLSelectElement>("locale");
const regionSelect = required<HTMLSelectElement>("region");
const structureSelect = required<HTMLSelectElement>("structure");
const layers = required<HTMLElement>("layers");
const dragModes = required<HTMLElement>("drag-modes");
const resetButton = required<HTMLButtonElement>("reset");
const status = required<HTMLElement>("status");
const viewerLoading = required<HTMLElement>("viewer-loading");
const viewerHelp = required<HTMLElement>("viewer-help");
const selectionTitle = required<HTMLElement>("selection-title");
const selectionId = required<HTMLElement>("selection-id");
const selectionType = required<HTMLElement>("selection-type");
const selectionCoverage = required<HTMLElement>("selection-coverage");
const selectionContext = required<HTMLElement>("selection-context");
const attribution = required<HTMLElement>("attribution");

let locale = localeSelect.value;
let regionFilter: RegionId | "body" = "body";
let layerFilter: StructureType | null = null;
let selectedStructureId: StructureId | null = null;
let interactionMode: InteractionMode = "rotate";
const viewer = await createSomakine(viewerHost, {
  dataset: bodyParts3DMusculoskeletal,
  locale,
  // BodyParts3D is Z-up after Three.js' glTF coordinate conversion.
  initialViewDirection: [0, -1, 0.18],
  initialViewUp: [0, 0, 1],
  // Let the host surface carry the model instead of introducing a second dark canvas.
  background: null,
  accessibleLabel: "Interactive BodyParts3D musculoskeletal model",
  onStateChange(next) {
    status.textContent = next.message;
    const loading = next.phase === "loading";
    viewerHost.setAttribute("aria-busy", String(loading));
    viewerLoading.hidden = !loading;
    viewerLoading.setAttribute("aria-hidden", String(!loading));
  },
  onSelection(selection) {
    handleSelection(selection);
  },
  onSelectionGroup(selections) {
    if (selections.length !== 1) handleSelectionGroup(selections);
  },
});

renderControls();
setViewerAccessibility();
const licenseAttribution = bodyParts3DMusculoskeletal.licenses.map((license) => license.attribution).join(" · ");
attribution.textContent = "BodyParts3D";
attribution.setAttribute("aria-label", licenseAttribution);
attribution.title = licenseAttribution;

localeSelect.addEventListener("change", () => {
  locale = localeSelect.value;
  viewer.setLocale(locale);
  regionFilter = "body";
  layerFilter = null;
  renderControls();
  viewer.reset();
  clearSelection();
  setViewerAccessibility();
});

regionSelect.addEventListener("change", () => {
  regionFilter = (regionSelect.value || "body") as RegionId | "body";
  if (selectedStructureId && !structureMatchesRegion(selectedStructureId, regionFilter)) clearSelection();
  renderControls();
  applyFilters();
});

structureSelect.addEventListener("change", () => {
  if (structureSelect.value) chooseStructure(structureSelect.value as StructureId);
});

resetButton.addEventListener("click", () => {
  regionFilter = "body";
  layerFilter = null;
  clearSelection();
  renderControls();
  viewer.reset();
});

function renderControls(): void {
  regionSelect.replaceChildren(option("body", locale === "zh-CN" ? "全身" : "Whole body"));
  for (const region of catalog.regions()) regionSelect.append(option(region.id, catalog.label(region.id, locale)));
  regionSelect.value = [...regionSelect.options].some((entry) => entry.value === regionFilter) ? regionFilter : "body";
  regionFilter = regionSelect.value as RegionId | "body";

  structureSelect.replaceChildren();
  for (const structure of catalog.structures()) {
    const coverage = catalog.representation(structure.id)!.mode;
    structureSelect.append(option(structure.id, `${catalog.label(structure.id, locale)} · ${coverage}`));
  }
  structureSelect.value = selectedStructureId ?? "";

  if (!layers.childElementCount) {
    const definitions: Array<[string, StructureType | null]> = [
      ["all", null], ["bone", "bone"], ["muscle", "muscle"], ["joint", "joint"], ["ligament", "ligament"], ["tendon", "tendon"],
    ];
    for (const [label, type] of definitions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.layer = label;
      button.setAttribute("aria-pressed", String((type === null && layerFilter === null) || type === layerFilter));
      button.addEventListener("click", () => {
        layerFilter = type;
        if (selectedStructureId && !structureMatchesLayer(selectedStructureId, layerFilter)) clearSelection();
        renderControls();
        applyFilters();
      });
      layers.append(button);
    }
  }
  const layerLabels = locale === "zh-CN"
    ? { all: "全部", bone: "骨骼", muscle: "肌肉", joint: "关节", ligament: "韧带", tendon: "肌腱" }
    : { all: "All", bone: "Bone", muscle: "Muscle", joint: "Joint", ligament: "Ligament", tendon: "Tendon" };
  for (const button of layers.querySelectorAll("button")) {
    const key = button.dataset.layer as keyof typeof layerLabels;
    button.textContent = layerLabels[key];
    const type = key === "all" ? null : key as StructureType;
    button.setAttribute("aria-pressed", String((type === null && layerFilter === null) || type === layerFilter));
  }

  if (!dragModes.childElementCount) {
    const definitions: Array<[InteractionMode, string]> = [["rotate", "rotate"], ["pan", "pan"]];
    for (const [mode, label] of definitions) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.dragMode = mode;
      button.setAttribute("aria-pressed", String(mode === interactionMode));
      button.addEventListener("click", () => {
        interactionMode = mode;
        viewer.setInteractionMode(mode);
        renderControls();
      });
      button.textContent = label;
      dragModes.append(button);
    }
  }
  const dragLabels = locale === "zh-CN" ? { rotate: "旋转", pan: "平移" } : { rotate: "Rotate", pan: "Pan" };
  for (const button of dragModes.querySelectorAll("button")) {
    const mode = button.dataset.dragMode as InteractionMode;
    button.textContent = dragLabels[mode];
    button.setAttribute("aria-pressed", String(mode === interactionMode));
  }
  resetButton.textContent = locale === "zh-CN" ? "重置全身视图" : "Reset body";
  viewerHelp.textContent = interactionMode === "rotate"
    ? (locale === "zh-CN"
      ? "左键拖拽旋转 · 右键拖拽平移 · Ctrl/Cmd 点击可多选 · 滚轮缩放"
      : "Drag to rotate · Right-drag to pan · Ctrl/Cmd-click to multi-select · Scroll to zoom")
    : (locale === "zh-CN"
      ? "左键拖拽平移 · 右键拖拽旋转 · Ctrl/Cmd 点击可多选 · 滚轮缩放"
      : "Drag to pan · Right-drag to rotate · Ctrl/Cmd-click to multi-select · Scroll to zoom");
}

function applyFilters(): void {
  const visibleIds = catalog.structures()
    .filter((structure) => regionFilter === "body" || structure.regionIds.includes(regionFilter))
    .filter((structure) => layerFilter === null || structure.type === layerFilter)
    .filter((structure) => {
      const mode = catalog.representation(structure.id)?.mode;
      return mode === "direct" || mode === "compound";
    })
    .map((structure) => structure.id);
  viewer.setVisible(visibleIds);
}

function clearSelection(): void {
  selectedStructureId = null;
  selectionTitle.textContent = locale === "zh-CN" ? "选择一个结构" : "Choose a structure";
  selectionId.textContent = "—";
  selectionType.textContent = "—";
  selectionCoverage.textContent = "—";
  selectionContext.textContent = "—";
  structureSelect.value = "";
}

function chooseStructure(id: StructureId): void {
  const structure = catalog.structure(id);
  if (!structure) return;
  selectedStructureId = id;
  if (!structureMatchesRegion(id, regionFilter)) regionFilter = structure.regionIds[0] ?? "body";
  if (!structureMatchesLayer(id, layerFilter)) layerFilter = structure.type;
  renderControls();
  applyFilters();
  viewer.selectStructure(id);
}

function handleSelection(selection: ViewerSelection): void {
  selectedStructureId = selection.structure.id;
  if (!structureMatchesRegion(selection.structure.id, regionFilter)) regionFilter = selection.structure.regionIds[0] ?? "body";
  if (!structureMatchesLayer(selection.structure.id, layerFilter)) layerFilter = null;
  renderControls();
  selectionTitle.textContent = selection.label;
  selectionId.textContent = selection.structure.id;
  selectionType.textContent = selection.structure.type;
  selectionCoverage.textContent = selection.coverage;
  selectionContext.textContent = selection.contextStructureIds.length
    ? selection.contextStructureIds.map((id) => catalog.label(id, locale)).join(", ")
    : "—";
}

function handleSelectionGroup(selections: readonly ViewerSelection[]): void {
  if (selections.length === 0) {
    clearSelection();
    return;
  }
  if (selections.length === 1) {
    const [selection] = selections;
    if (selection) handleSelection(selection);
    return;
  }
  selectedStructureId = null;
  renderControls();
  selectionTitle.textContent = locale === "zh-CN" ? `已选择 ${selections.length} 个结构` : `${selections.length} structures selected`;
  selectionId.textContent = selections.map((selection) => selection.structure.id).join(", ");
  selectionType.textContent = [...new Set(selections.map((selection) => selection.structure.type))].join(", ");
  selectionCoverage.textContent = [...new Set(selections.map((selection) => selection.coverage))].join(", ");
  selectionContext.textContent = "—";
}

function structureMatchesRegion(id: StructureId, region: RegionId | "body"): boolean {
  return region === "body" || catalog.structure(id)?.regionIds.includes(region) === true;
}

function structureMatchesLayer(id: StructureId, layer: StructureType | null): boolean {
  return layer === null || catalog.structure(id)?.type === layer;
}

function setViewerAccessibility(): void {
  viewer.canvas.setAttribute(
    "aria-label",
    locale === "zh-CN" ? "可交互的 BodyParts3D 肌骨模型" : "Interactive BodyParts3D musculoskeletal model",
  );
  viewer.canvas.setAttribute("aria-describedby", "viewer-help status");
}

function option(value: string, label: string): HTMLOptionElement {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}
}
