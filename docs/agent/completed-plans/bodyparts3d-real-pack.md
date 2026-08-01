# BodyParts3D real musculoskeletal pack

Status: completed 2026-08-01.

## Goal

Ship a real BodyParts3D 4.0 musculoskeletal data pack for Somakine by copying
the already downloaded and derived, manifest-verified assets from the Kinexis
workspace, without another network download and without importing Kinexis
product behavior or IDs as public identity.

## Scope

- Add `@somakine/bodyparts3d-musculoskeletal` with eight body regions, canonical
  cross-region Somakine structure IDs, English and Simplified Chinese labels,
  FMA/BodyParts3D external IDs, and honest direct/compound/context coverage.
- Copy only the twelve referenced self-contained GLBs plus the BodyParts3D
  license; do not copy the 201 MiB upstream ZIP cache into the repository.
- Add a deterministic import tool that verifies the legacy derived manifest,
  every source byte count and SHA-256, GLB self-containment, canonical-ID
  deduplication, locale completeness, and the finished Somakine pack.
- Switch the vanilla example from synthetic geometry to the real pack and serve
  the pack's public assets directly through Vite.
- Add real-pack validation, asset verification, provenance and coverage tests.

## Non-Goals

- Preserve Kinexis routes, graph node IDs, educational prose, clinical claims,
  or product relationship types.
- Claim direct ligament, tendon or joint geometry where BodyParts3D provides
  only contextual boundary anatomy.
- Re-download BodyParts3D, commit upstream ZIP archives, or publish packages.
- Treat the imported terminology as qualified clinical review.

## Approach

1. Read the old derived manifest, graph identity records and locale label files.
2. Group coverage by canonical structure slug, merging duplicate humerus and
   femur region views while retaining their FMA/BodyParts3D identifiers.
3. Bind direct structures to named nodes in their region GLB; bind compound
   structures to each reviewed source element in its supplement GLB; translate
   context references to canonical IDs.
4. Copy GLBs only after source hashes match the manifest, emit a generated
   TypeScript data pack and public `pack.json`, then validate the result through
   `@somakine/core` and `@somakine/bodyparts3d`.
5. Integrate the package into workspace builds, the example, tests, budgets,
   attribution checks and documentation.

## Acceptance Criteria

- The pack contains 150 canonical structures from 152 regional coverage entries.
- Coverage remains 123 regional direct entries and four compound entries before
  canonical deduplication, with all 25 contextual entries explicitly disclosed.
- Humerus and femur each have one canonical ID and belong to two regions.
- All twelve GLBs match checked sizes and SHA-256 digests and contain no URI.
- The real example renders BodyParts3D geometry and exposes all eight regions.
- BodyParts3D attribution is visible and package/source licenses remain separate
  from the Apache-2.0 framework license.

## Verification

```sh
npm run import:bodyparts3d -- --source /Users/shuo/code/kinexis
npm run check
node packages/cli/dist/bin.js verify-assets data-packs/bodyparts3d-musculoskeletal/public/pack.json --json
npm pack --dry-run -w @somakine/bodyparts3d-musculoskeletal
```

## Risks and Rollback

- The legacy GLBs are accepted only as verified derived BodyParts3D artifacts;
  the importer fails closed on any changed manifest, byte count, digest, node
  name or embedded URI. Roll back by removing the new workspace and restoring
  the example's synthetic dependency.
- Locale labels are imported only as names and aliases, never educational or
  clinical prose. Qualified terminology review remains pending.
- The legacy manifest does not authoritatively label individual mesh side, so
  imported structures use `variable` and instances use `none` until a dedicated
  laterality review is completed; `M` suffixes are not guessed as left/right.
- The approximately 13 MiB runtime asset set increases repository and example footprint. It stays in
  a separately licensed data-pack boundary and can later move to release assets
  without changing core or viewer contracts.

## Implementation notes

- Browser reproduction initially showed `Somakine initialization aborted` for
  every non-abort load failure. The viewer disposed its scene before checking
  the abort signal, so disposal itself erased the original exception. Capture
  abort state before disposal; browser verification must confirm that subsequent
  loader failures retain their real message.
