import { DataPackValidationError } from "./errors.js";
import type { Asset, CoverageMode, CoverageSummary, DataPack, LateralSide, LocalePack, MeshInstance, Region, RegionId, Relation, Representation, Structure, StructureId, StructureType } from "./model.js";
import { validateDataPack } from "./validation.js";

export interface SearchResult { id: StructureId; label: string; type: StructureType; coverage: CoverageMode }

export class SomakineCatalog {
  readonly pack: DataPack;
  readonly #regions: Map<RegionId, Region>;
  readonly #structures: Map<StructureId, Structure>;
  readonly #representations: Map<StructureId, Representation>;
  readonly #instances: Map<string, MeshInstance>;
  readonly #assets: Map<string, Asset>;
  readonly #locales: Map<string, LocalePack>;
  readonly #relationsByStructure: Map<StructureId, Relation[]>;

  constructor(pack: DataPack) {
    const result = validateDataPack(pack);
    if (!result.valid) throw new DataPackValidationError(result.issues);
    this.pack = deepFreeze(structuredClone(pack));
    this.#regions = new Map(this.pack.regions.map((region) => [region.id, region]));
    this.#structures = new Map(this.pack.structures.map((structure) => [structure.id, structure]));
    this.#representations = new Map(this.pack.representations.map((representation) => [representation.structureId, representation]));
    this.#instances = new Map(this.pack.meshInstances.map((instance) => [instance.id, instance]));
    this.#assets = new Map(this.pack.assets.map((asset) => [asset.id, asset]));
    this.#locales = new Map(this.pack.locales.map((locale) => [locale.locale, locale]));
    this.#relationsByStructure = new Map();
    for (const relation of this.pack.relations) for (const id of [relation.sourceId, relation.targetId]) {
      const list = this.#relationsByStructure.get(id) ?? [];
      list.push(relation);
      this.#relationsByStructure.set(id, list);
    }
    for (const list of this.#relationsByStructure.values()) Object.freeze(list.sort((a, b) => a.id.localeCompare(b.id)));
  }

  regions(): readonly Region[] { return [...this.#regions.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) }
  structures(options: { regionId?: RegionId; type?: StructureType } = {}): readonly Structure[] {
    return [...this.#structures.values()]
      .filter((structure) => !options.regionId || structure.regionIds.includes(options.regionId))
      .filter((structure) => !options.type || structure.type === options.type)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  structure(id: StructureId): Structure | null { return this.#structures.get(id) ?? null }
  region(id: RegionId): Region | null { return this.#regions.get(id) ?? null }
  representation(id: StructureId): Representation | null { return this.#representations.get(id) ?? null }
  instancesFor(id: StructureId, options: { side?: LateralSide } = {}): readonly MeshInstance[] {
    const representation = this.#representations.get(id);
    const instances = representation?.instanceIds.map((instanceId) => this.#instances.get(instanceId)!).filter(Boolean) ?? [];
    const side = options.side;
    if (side === undefined) return instances;
    // A bilateral instance spans both sides, so it is included for either.
    return instances.filter((instance) => instance.laterality === side || instance.laterality === "bilateral");
  }
  asset(id: string): Asset | null { return this.#assets.get(id) ?? null }
  relations(id: StructureId): readonly Relation[] { return this.#relationsByStructure.get(id) ?? [] }
  label(id: string, locale: string): string { return this.#locales.get(locale)?.labels[id] ?? this.#locales.get("en")?.labels[id] ?? id }
  aliases(id: string, locale: string): readonly string[] { return this.#locales.get(locale)?.aliases[id] ?? [] }
  search(query: string, locale: string, limit = 20): readonly SearchResult[] {
    const normalized = query.trim().toLocaleLowerCase(locale);
    if (!normalized || limit < 1) return [];
    return this.structures().map((structure) => {
      const label = this.label(structure.id, locale);
      const aliases = this.aliases(structure.id, locale);
      const haystack = [label, ...aliases, ...Object.values(structure.externalIds)].join("\n").toLocaleLowerCase(locale);
      return { structure, label, matches: haystack.includes(normalized) };
    }).filter((entry) => entry.matches).slice(0, Math.min(limit, 50)).map(({ structure, label }) => ({
      id: structure.id, label, type: structure.type, coverage: this.#representations.get(structure.id)!.mode,
    }));
  }
  coverage(): CoverageSummary {
    const summary: CoverageSummary = { direct: 0, compound: 0, context: 0, unavailable: 0 };
    for (const representation of this.#representations.values()) summary[representation.mode] += 1;
    return summary;
  }
  contextFor(id: StructureId): readonly Structure[] {
    const representation = this.#representations.get(id);
    if (representation?.mode !== "context") return [];
    return representation.contextStructureIds.map((contextId) => this.#structures.get(contextId)!).filter(Boolean);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
