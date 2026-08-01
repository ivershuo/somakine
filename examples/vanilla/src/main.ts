import "./style.css";
import { SomakineCatalog, type RegionId, type StructureId, type StructureType } from "@somakine/core";
import { createSomakine } from "@somakine/viewer";
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.textContent = `Somakine failed to start: ${message}`;
});

async function main(): Promise<void> {
const catalog = new SomakineCatalog(musculoskeletalBasic);
const viewerHost = required<HTMLElement>("viewer");
const localeSelect = required<HTMLSelectElement>("locale");
const regionSelect = required<HTMLSelectElement>("region");
const structureSelect = required<HTMLSelectElement>("structure");
const layers = required<HTMLElement>("layers");
const resetButton = required<HTMLButtonElement>("reset");
const status = required<HTMLElement>("status");
const selectionTitle = required<HTMLElement>("selection-title");
const selectionId = required<HTMLElement>("selection-id");
const selectionType = required<HTMLElement>("selection-type");
const selectionCoverage = required<HTMLElement>("selection-coverage");
const selectionContext = required<HTMLElement>("selection-context");
const attribution = required<HTMLElement>("attribution");

let locale = localeSelect.value;
const viewer = await createSomakine(viewerHost, {
  dataset: musculoskeletalBasic,
  locale,
  accessibleLabel: "Interactive synthetic body model",
  onStateChange(next) {
    status.textContent = next.message;
    viewerHost.setAttribute("aria-busy", String(next.phase === "loading"));
  },
  onSelection(selection) {
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
attribution.textContent = musculoskeletalBasic.licenses.map((license) => license.attribution).join(" · ");

localeSelect.addEventListener("change", () => {
  locale = localeSelect.value;
  renderControls();
  viewer.reset();
  clearSelection();
});

regionSelect.addEventListener("change", () => {
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
      button.addEventListener("click", () => { viewer.setLayer(type); pressLayer(label) });
      layers.append(button);
    }
  }
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
