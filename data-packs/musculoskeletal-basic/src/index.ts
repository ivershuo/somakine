import { SOMAKINE_SCHEMA_VERSION, type DataPack } from "@somakine/core";

const sourceId = "somakine-synthetic-alpha";
const licenseId = "MIT";

export const musculoskeletalBasic: DataPack = {
  schemaVersion: SOMAKINE_SCHEMA_VERSION,
  id: "somakine-musculoskeletal-basic",
  version: "0.2.0-alpha.0",
  title: "Somakine synthetic musculoskeletal pack",
  description: "Programmatic shapes for framework testing; not medical anatomy.",
  createdAt: "2026-08-01T00:00:00Z",
  sources: [
    {
      id: sourceId,
      title: "Somakine synthetic alpha fixture",
      version: "0.1.0",
      url: "https://github.com/ivershuo/somakine",
      retrievedAt: "2026-08-01T00:00:00Z"
    }
  ],
  licenses: [
    {
      id: licenseId,
      name: "MIT License",
      url: "https://opensource.org/license/mit",
      attribution: "Synthetic shapes © 2026 Somakine contributors",
      redistribution: "permissive"
    }
  ],
  regions: [
    { id: "somakine:region:head-neck", order: 1, sourceIds: [sourceId] },
    { id: "somakine:region:shoulder", order: 2, sourceIds: [sourceId] },
    { id: "somakine:region:spine-trunk", order: 3, sourceIds: [sourceId] },
    { id: "somakine:region:hip-pelvis", order: 4, sourceIds: [sourceId] },
    { id: "somakine:region:knee", order: 5, sourceIds: [sourceId] }
  ],
  structures: [
    structure("skull", "bone", "midline", ["head-neck"]),
    structure("spine", "bone", "midline", ["spine-trunk"]),
    structure("pelvis", "bone", "midline", ["spine-trunk", "hip-pelvis"]),
    structure("humerus", "bone", "paired", ["shoulder"]),
    structure("femur", "bone", "paired", ["hip-pelvis", "knee"]),
    structure("deltoid", "muscle", "paired", ["shoulder"]),
    structure("knee-joint", "joint", "paired", ["knee"]),
    structure("anterior-cruciate-ligament", "ligament", "paired", ["knee"]),
    structure("patellar-tendon", "tendon", "paired", ["knee"])
  ],
  relations: [
    relation("deltoid-attaches-humerus", "attaches_to", "deltoid", "humerus"),
    relation("knee-joint-articulates-femur", "articulates_with", "knee-joint", "femur"),
    relation("acl-part-knee-joint", "part_of", "anterior-cruciate-ligament", "knee-joint"),
    relation("patellar-tendon-attaches-femur", "attaches_to", "patellar-tendon", "femur")
  ],
  assets: [
    primitive("skull", "sphere", [0.34, 0.42, 0.32], "#e8dfc7"),
    primitive("spine", "capsule", [0.10, 0.78, 0.10], "#e8dfc7"),
    primitive("pelvis", "box", [0.50, 0.22, 0.22], "#d8cfb8"),
    primitive("humerus", "capsule", [0.085, 0.58, 0.085], "#eee5cd"),
    primitive("femur", "capsule", [0.11, 0.76, 0.11], "#eee5cd"),
    primitive("deltoid", "sphere", [0.23, 0.34, 0.20], "#b9473f")
  ],
  meshInstances: [
    instance("skull", "skull", "none", [0, 1.62, 0]),
    instance("spine", "spine", "none", [0, 0.98, 0]),
    instance("pelvis", "pelvis", "none", [0, 0.48, 0]),
    instance("humerus-left", "humerus", "left", [-0.38, 1.08, 0], [0, 0, -0.18]),
    instance("humerus-right", "humerus", "right", [0.38, 1.08, 0], [0, 0, 0.18]),
    instance("femur-left", "femur", "left", [-0.16, 0.05, 0], [0, 0, -0.04]),
    instance("femur-right", "femur", "right", [0.16, 0.05, 0], [0, 0, 0.04]),
    instance("deltoid-left", "deltoid", "left", [-0.39, 1.38, 0]),
    instance("deltoid-right", "deltoid", "right", [0.39, 1.38, 0])
  ],
  representations: [
    direct("skull", ["skull"]),
    direct("spine", ["spine"]),
    direct("pelvis", ["pelvis"]),
    direct("humerus", ["humerus-left", "humerus-right"]),
    direct("femur", ["femur-left", "femur-right"]),
    compound("deltoid", ["deltoid-left", "deltoid-right"]),
    context("knee-joint", ["femur"]),
    unavailable("anterior-cruciate-ligament"),
    context("patellar-tendon", ["femur"])
  ],
  locales: [
    {
      locale: "en",
      labels: {
        "somakine:region:head-neck": "Head and neck",
        "somakine:region:shoulder": "Shoulder",
        "somakine:region:spine-trunk": "Spine and trunk",
        "somakine:region:hip-pelvis": "Hip and pelvis",
        "somakine:region:knee": "Knee",
        "somakine:structure:skull": "Skull",
        "somakine:structure:spine": "Spine",
        "somakine:structure:pelvis": "Pelvis",
        "somakine:structure:humerus": "Humerus",
        "somakine:structure:femur": "Femur",
        "somakine:structure:deltoid": "Deltoid",
        "somakine:structure:knee-joint": "Knee joint",
        "somakine:structure:anterior-cruciate-ligament": "Anterior cruciate ligament",
        "somakine:structure:patellar-tendon": "Patellar tendon"
      },
      aliases: {
        "somakine:structure:anterior-cruciate-ligament": ["ACL"],
        "somakine:structure:patellar-tendon": ["patellar ligament"]
      }
    },
    {
      locale: "zh-CN",
      labels: {
        "somakine:region:head-neck": "头颈",
        "somakine:region:shoulder": "肩部",
        "somakine:region:spine-trunk": "脊柱与躯干",
        "somakine:region:hip-pelvis": "髋与骨盆",
        "somakine:region:knee": "膝部",
        "somakine:structure:skull": "颅骨",
        "somakine:structure:spine": "脊柱",
        "somakine:structure:pelvis": "骨盆",
        "somakine:structure:humerus": "肱骨",
        "somakine:structure:femur": "股骨",
        "somakine:structure:deltoid": "三角肌",
        "somakine:structure:knee-joint": "膝关节",
        "somakine:structure:anterior-cruciate-ligament": "前交叉韧带",
        "somakine:structure:patellar-tendon": "髌腱"
      },
      aliases: {
        "somakine:structure:anterior-cruciate-ligament": ["ACL", "前十字韧带"]
      }
    }
  ]
};

function structure(slug: string, type: "bone" | "joint" | "ligament" | "muscle" | "tendon", laterality: "paired" | "midline", regions: string[]) {
  return {
    id: `somakine:structure:${slug}` as const,
    type,
    laterality,
    regionIds: regions.map((region) => `somakine:region:${region}` as const),
    externalIds: {},
    sourceIds: [sourceId],
    reviewState: "unreviewed" as const
  };
}

function relation(slug: string, type: "part_of" | "articulates_with" | "attaches_to", source: string, target: string) {
  return {
    id: `somakine:relation:${slug}` as const,
    type,
    sourceId: `somakine:structure:${source}` as const,
    targetId: `somakine:structure:${target}` as const,
    sourceIds: [sourceId],
    reviewState: "unreviewed" as const
  };
}

function primitive(slug: string, shape: "box" | "sphere" | "cylinder" | "capsule", dimensions: readonly [number, number, number], color: string) {
  return {
    id: `somakine:asset:synthetic:${slug}` as const,
    kind: "primitive" as const,
    primitive: { shape, dimensions, color },
    sourceIds: [sourceId],
    licenseId
  };
}

function instance(slug: string, asset: string, laterality: "none" | "left" | "right", position: readonly [number, number, number], rotation?: readonly [number, number, number]) {
  return {
    id: `somakine:instance:${slug}` as const,
    assetId: `somakine:asset:synthetic:${asset}` as const,
    laterality,
    selector: { kind: "scene" as const },
    transform: rotation ? { position, rotation } : { position }
  };
}

function direct(slug: string, instances: string[]) {
  return representation(slug, "direct", instances, []);
}

function compound(slug: string, instances: string[]) {
  return representation(slug, "compound", instances, []);
}

function context(slug: string, contextStructures: string[]) {
  return representation(slug, "context", [], contextStructures);
}

function unavailable(slug: string) {
  return representation(slug, "unavailable", [], []);
}

function representation(slug: string, mode: "direct" | "compound" | "context" | "unavailable", instances: string[], contexts: string[]) {
  return {
    id: `somakine:representation:${slug}` as const,
    structureId: `somakine:structure:${slug}` as const,
    mode,
    instanceIds: instances.map((id) => `somakine:instance:${id}` as const),
    contextStructureIds: contexts.map((id) => `somakine:structure:${id}` as const),
    sourceIds: [sourceId],
    reviewState: "unreviewed" as const
  };
}
