import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";

const sourceId = "demo-knee-source";
const licenseId = "demo-knee-license";
const regionId = "somakine:region:demo-knee-support";
const structureId = "somakine:structure:demo-knee-ligament";
const assetId = "somakine:asset:demo-knee:ligament";

export const demoExtension = {
  schemaVersion: "0.1.0",
  id: "demo-knee-extension",
  version: "0.1.0",
  title: "Demo knee extension",
  description: "A local extension fixture that fills ACL coverage and adds a reviewed demo ligament.",
  createdAt: "2026-08-02T00:00:00.000Z",
  namespace: "demo-knee",
  targetPack: { id: musculoskeletalBasic.id, version: musculoskeletalBasic.version },
  sources: [{
    id: sourceId,
    title: "Somakine extension fixture",
    version: "0.1.0",
    url: "https://github.com/ivershuo/somakine",
    retrievedAt: "2026-08-02T00:00:00.000Z",
  }],
  licenses: [{
    id: licenseId,
    name: "MIT License",
    url: "https://opensource.org/license/mit",
    attribution: "Demo extension © 2026 Somakine contributors",
    redistribution: "permissive",
  }],
  regions: [{ id: regionId, order: 1, sourceIds: [sourceId] }],
  structures: [{
    id: structureId,
    type: "ligament",
    laterality: "paired",
    regionIds: [regionId],
    externalIds: { demo: "demo-knee-ligament" },
    sourceIds: [sourceId],
    reviewState: "source-reviewed",
  }],
  relations: [{
    id: "somakine:relation:demo-knee-ligament-attaches-femur",
    type: "attaches_to",
    sourceId: structureId,
    targetId: "somakine:structure:femur",
    sourceIds: [sourceId],
    reviewState: "source-reviewed",
  }],
  assets: [{
    id: assetId,
    kind: "primitive",
    primitive: { shape: "capsule", dimensions: [0.035, 0.24, 0.035], color: "#c7554b" },
    sourceIds: [sourceId],
    licenseId,
  }],
  meshInstances: [
    {
      id: "somakine:instance:demo-knee-acl-left",
      assetId,
      laterality: "left",
      selector: { kind: "scene" },
      transform: { position: [-0.08, 0.2, 0.06], rotation: [0, 0, -0.2] },
    },
    {
      id: "somakine:instance:demo-knee-acl-right",
      assetId,
      laterality: "right",
      selector: { kind: "scene" },
      transform: { position: [0.08, 0.2, 0.06], rotation: [0, 0, 0.2] },
    },
  ],
  representations: [
    {
      id: "somakine:representation:demo-knee-acl",
      structureId: "somakine:structure:anterior-cruciate-ligament",
      mode: "compound",
      instanceIds: ["somakine:instance:demo-knee-acl-left", "somakine:instance:demo-knee-acl-right"],
      contextStructureIds: [],
      sourceIds: [sourceId],
      reviewState: "source-reviewed",
    },
    {
      id: "somakine:representation:demo-knee-ligament",
      structureId,
      mode: "compound",
      instanceIds: ["somakine:instance:demo-knee-acl-left", "somakine:instance:demo-knee-acl-right"],
      contextStructureIds: [],
      sourceIds: [sourceId],
      reviewState: "source-reviewed",
    },
  ],
  locales: [
    {
      locale: "en",
      labels: { [regionId]: "Demo knee support", [structureId]: "Demo knee ligament" },
      aliases: { "somakine:structure:anterior-cruciate-ligament": ["demo ACL"] },
    },
    {
      locale: "zh-CN",
      labels: { [regionId]: "演示膝部支持结构", [structureId]: "演示膝韧带" },
      aliases: { "somakine:structure:anterior-cruciate-ligament": ["演示前交叉韧带"] },
    },
  ],
  mappings: [{
    targetStructureId: "somakine:structure:anterior-cruciate-ligament",
    match: "exact",
    confidence: 1,
    sourceIds: [sourceId],
    reviewState: "source-reviewed",
  }],
};
