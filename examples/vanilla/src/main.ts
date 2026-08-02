import "./style.css";
import { SomakineCatalog, type RegionId, type StructureId, type StructureType } from "@somakine/core";
import { createSomakine } from "@somakine/viewer";
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
const resetButton = required<HTMLButtonElement>("reset");
const status = required<HTMLElement>("status");
const viewerHelp = required<HTMLElement>("viewer-help");
const selectionTitle = required<HTMLElement>("selection-title");
const selectionId = required<HTMLElement>("selection-id");
const selectionType = required<HTMLElement>("selection-type");
const selectionCoverage = required<HTMLElement>("selection-coverage");
const selectionContext = required<HTMLElement>("selection-context");
const attribution = required<HTMLElement>("attribution");

let locale = localeSelect.value;
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
    viewerHost.setAttribute("aria-busy", String(next.phase === "loading"));
  },
  onSelection(selection) {
    const currentRegion = regionSelect.value as RegionId | "body";
    const selectedRegion = currentRegion !== "body" && selection.structure.regionIds.includes(currentRegion)
      ? currentRegion
      : selection.structure.regionIds[0];
    if (selectedRegion) regionSelect.value = selectedRegion;
    pressLayer("all");
    selectionTitle.textContent = catalog.label(selection.structure.id, locale);
    selectionId.textContent = selection.structure.id;
    selectionType.textContent = selection.structure.type;
    selectionCoverage.textContent = selection.coverage;
    selectionContext.textContent = selection.contextStructureIds.length
      ? selection.contextStructureIds.map((id) => catalog.label(id, locale)).join(", ")
      : "—";
    structureSelect.value = selection.structure.id;
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
  regionSelect.value = "body";
  renderControls();
  viewer.reset();
  clearSelection();
  setViewerAccessibility();
});

regionSelect.addEventListener("change", () => {
  clearSelection();
  pressLayer("all");
  if (regionSelect.value === "body") viewer.showBody();
  else viewer.focusRegion(regionSelect.value as RegionId);
});

structureSelect.addEventListener("change", () => {
  if (structureSelect.value) viewer.focusStructure(structureSelect.value as StructureId);
});

resetButton.addEventListener("click", () => {
  regionSelect.value = "body";
  pressLayer("all");
  viewer.reset();
  clearSelection();
});

function renderControls(): void {
  const selectedRegion = regionSelect.value || "body";
  regionSelect.replaceChildren(option("body", locale === "zh-CN" ? "全身" : "Whole body"));
  for (const region of catalog.regions()) regionSelect.append(option(region.id, catalog.label(region.id, locale)));
  regionSelect.value = [...regionSelect.options].some((entry) => entry.value === selectedRegion) ? selectedRegion : "body";

  const selectedStructure = structureSelect.value;
  structureSelect.replaceChildren();
  for (const structure of catalog.structures()) {
    const coverage = catalog.representation(structure.id)!.mode;
    structureSelect.append(option(structure.id, `${catalog.label(structure.id, locale)} · ${coverage}`));
  }
  if ([...structureSelect.options].some((entry) => entry.value === selectedStructure)) structureSelect.value = selectedStructure;

  if (!layers.childElementCount) {
    const definitions: Array<[string, StructureType | null]> = [
      ["all", null], ["bone", "bone"], ["muscle", "muscle"], ["joint", "joint"], ["ligament", "ligament"], ["tendon", "tendon"],
    ];
    for (const [label, type] of definitions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.layer = label;
      button.setAttribute("aria-pressed", String(label === "all"));
      button.addEventListener("click", () => {
        clearSelection();
        viewer.setLayer(type);
        pressLayer(label);
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
  }
  resetButton.textContent = locale === "zh-CN" ? "重置全身视图" : "Reset body";
  viewerHelp.textContent = locale === "zh-CN"
    ? "拖拽旋转 · 滚轮缩放 · 右键拖拽平移"
    : "Drag to rotate · Scroll to zoom · Right-drag to pan";
}

function pressLayer(layer: string): void {
  for (const button of layers.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.layer === layer));
}

function clearSelection(): void {
  selectionTitle.textContent = locale === "zh-CN" ? "选择一个结构" : "Choose a structure";
  selectionId.textContent = "—";
  selectionType.textContent = "—";
  selectionCoverage.textContent = "—";
  selectionContext.textContent = "—";
  structureSelect.value = "";
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
