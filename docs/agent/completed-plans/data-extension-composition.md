# Developer-loaded data extensions

## Goal

Allow a host product or community package to load independently licensed
Somakine data extensions on top of a validated base pack, fill missing visual
coverage, add new structures, and render the composed result through the
existing Viewer without source-specific code.

## Scope

- Add a validated `DataExtension` contract with target-pack metadata, namespace,
  provenance, mappings, optional new structures/regions, assets, relations,
  representations, and partial locales.
- Add deterministic `composeDataPacks()` support with explicit conflict policies:
  `fill-unavailable`, `prefer-extension`, and `error-on-conflict`.
- Preserve per-source and per-asset license records and reject ambiguous asset
  IDs or URIs.
- Add CLI commands for extension validation and composition.
- Add JSON Schema, documentation, fixtures, and tests.
- Keep Viewer behavior unchanged: it continues to consume the composed standard
  `DataPack` and can use the existing custom `AssetResolver`.

## Non-Goals

- Do not download or bundle new third-party anatomy data.
- Do not support arbitrary runtime model formats; extensions still use the
  existing primitive/self-contained GLB asset contract.
- Do not silently replace reviewed direct geometry with another source.
- Do not add source-specific mapping logic to `@somakine/viewer`.

## Approach

1. Extended core types with extension metadata, mappings, composition policies,
   and composition reports.
2. Implemented extension validation that allows references to an existing base
   pack while requiring all extension-owned IDs to use the declared namespace.
3. Composed registries and geometry deterministically, filling only unavailable
   or contextual base coverage by default; required explicit mappings for
   existing structures and rejected direct/direct conflicts.
4. Merged relations and locales without losing provenance, then ran the existing
   full `DataPack` validator on the composed result.
5. Added `soma validate-extension` and `soma compose` with JSON output and
   host-controlled asset paths.
6. Added a local extension fixture that fills an unavailable ligament and adds a
   new structure.

## Acceptance Criteria

- A developer can validate an extension independently and compose it with a
  base pack using a public core API.
- An extension can fill a base `unavailable`/`context` representation only when
  a mapping and compatible representation are present.
- Direct-to-direct conflicts, ID collisions, URI collisions, target-pack
  mismatches, missing labels, invalid provenance, and unsafe assets fail with
  actionable errors.
- The composed pack passes the existing data-pack validator and renders through
  the unchanged Viewer API.
- CLI validation, composition, asset verification, typecheck, tests, boundary,
  license, budget, and production-build gates pass.

## Verification

- `npm run check` — passed.
- `git diff --check` — passed.
- `soma validate-extension` and `soma compose` were exercised with the local
  extension fixture.
- 21 automated tests pass, including core composition and CLI coverage.

## Risks and Rollback

- A user extension can contain inaccurate anatomy; review state and provenance
  remain mandatory, and Somakine does not promote user data to expert-reviewed.
- A composed pack may exceed runtime budgets; the existing asset and budget
  checks remain authoritative.
- A custom resolver must map extension asset URIs safely; the Viewer still
  verifies byte counts and digests before parsing.
- Roll back by reverting the feature commit; no upstream or third-party assets
  are changed.

## Result

Implemented on 2026-08-02. `@somakine/core` now exports `DataExtension`,
`validateDataExtension`, `composeDataPacks`, composition policies, and reports;
`@somakine/cli` can validate and emit composed packs; documentation and JSON
Schema cover the authoring flow. Viewer code remains source-agnostic.
