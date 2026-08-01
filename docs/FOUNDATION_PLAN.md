# Foundation implementation plan

Status: alpha foundation implemented on 2026-08-01.

## Delivered

- Independent Apache-2.0 TypeScript workspace with no Kinexis compatibility layer.
- Framework-neutral core schema, executable validation, localization, catalog,
  provenance, licenses, coverage semantics, and JSON Schema.
- Three.js viewer with primitives, verified self-contained GLB loading, semantic
  selection, layers, region focus, reset, abort, and disposal.
- BodyParts3D provenance adapter, validation/inspection CLI, synthetic data pack,
  vanilla example, tests, security checks, and distribution budgets.

## Real anatomy pack — delivered 2026-08-01

The verified BodyParts3D 4.0 snapshot and twelve existing self-contained GLBs
were imported without another network download. The generated pack contains 150
canonical structures: 121 direct, four compound and 25 contextual. License and
source provenance are included. Qualified terminology/anatomical review and
golden browser screenshots remain release work.

## Release exit criteria

- No unreviewed source or license record in the real pack.
- Every declared GLB passes path, size, digest, self-containment, and geometry checks.
- English and Simplified Chinese labels cover every region and structure.
- API Extractor or equivalent public-contract snapshot is enabled before `0.1.0`.
- The synthetic pack remains clearly identified as non-medical test geometry.
