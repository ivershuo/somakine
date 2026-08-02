# BodyParts3D joint, ligament, and tendon coverage

## Goal

Bring Somakine's BodyParts3D pack in line with the source audit: structures
that have a real BodyParts3D representation receive direct geometry, while
the existing product-oriented placeholders that have no source identity are
marked unavailable instead of presenting adjacent bones or muscles as the
target.

## Scope

- Add an explicit, reviewed source mapping for the BodyParts3D structures that
  are in the locomotor scope of this pack:
  - the articular disk of the symphysis and 23 intervertebral symphyses;
  - tarsal/plantar/long plantar ligaments, stylohyoid ligaments, and their
    source-provided left/right variants;
  - calcaneal and intermediate tendons, including source-provided variants.
- Generate verified GLB supplements from the existing SHA-256-verified
  BodyParts3D archives and expose each selected source structure as selectable
  direct coverage in the data pack.
- Change the 25 current joint/ligament/tendon/multifidus placeholders from
  contextual coverage to `unavailable` because the audit found no exact source
  representation for them. Do not infer target geometry from neighboring
  structures.
- Keep source provenance and license records intact, and include selected and
  excluded source rows in the import report for future audits.

## Non-goals

- Do not import the full BodyParts3D muscle ontology in this change.
- Do not add ocular, laryngeal/vocal, or ontology-category rows such as
  `skeletal ligament`, `ligament organ`, or generic `tendon`; they have source
  geometry but are outside this locomotor pack's current scope or are grouping
  concepts rather than user-facing structures.
- Do not rename or silently re-map the existing product-oriented structures to
  nearby BodyParts3D rows.
- Do not alter viewer behavior or the core schema.

## Approach

1. Add a versioned supplemental coverage manifest owned by Somakine. Each
   entry records its source tree, FMA ID, BodyParts3D representation ID, region,
   type, and laterality.
2. Extend the BodyParts3D importer to validate those IDs against the verified
   source tables, read the referenced OBJ members, build region supplement
   GLBs, and include their hashes/geometry budgets in the pack.
3. Generate direct representations and mesh instances from the source element
   names. Convert existing context-only placeholders to `unavailable`.
4. Regenerate `pack.json`, `src/generated.ts`, and the import report, then run
   the complete Somakine quality gate and focused coverage tests.

## Acceptance criteria

- Every selected supplemental entry has a matching source table row and at
  least one verified OBJ element; every generated instance points to a real
  GLB node.
- No current placeholder is labeled `context` unless it has a real contextual
  relationship; the audited unmatched target set is `unavailable`.
- Pack validation, generated-module type checking, asset provenance checks,
  runtime budgets, and existing viewer tests pass.
- The import report records selected source IDs and explicit out-of-scope
  exclusions so the source comparison is reviewable.

## Verification

- Run `npm run import:bodyparts3d -- --source /Users/shuo/code/kinexis`.
- Run `npm run check` and inspect the coverage summary and generated asset
  hashes.
- Add tests for the selected direct structures, unavailable placeholders, and
  source-to-mesh node references.

## Risks and rollback

- Supplemental geometry may exceed the existing region transfer budgets. The
  importer must fail before writing a pack if a supplement exceeds its asset or
  cumulative route budget; reduce the selected source set only through a
  manifest change with a documented reason.
- If source archives or table hashes differ, import must fail rather than
  silently produce a different dataset. Roll back by restoring the generated
  pack files and the supplemental manifest; no upstream archive is modified.

## Result

Implemented on 2026-08-02. The regenerated pack contains 187 structures, 158
direct, four compound, and 25 unavailable representations across 15 verified
GLBs. The source audit records 72 candidate rows, 37 selected locomotor rows,
and 35 explicit exclusions. `npm run check` passes all type, test, boundary,
license, budget, and production-build gates.
