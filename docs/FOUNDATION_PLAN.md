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

## Next milestone: real anatomy pack

1. Freeze a reviewed BodyParts3D source snapshot and checksums.
2. Build a deterministic conversion pipeline to optimized self-contained GLBs.
3. Map source objects to Somakine structure IDs and explicitly classify gaps as
   direct, compound, contextual, or unavailable.
4. Obtain license/provenance review and qualified anatomical review.
5. Add golden screenshots and browser journeys once CI has a WebGL-capable browser.

## Release exit criteria

- No unreviewed source or license record in the real pack.
- Every declared GLB passes path, size, digest, self-containment, and geometry checks.
- English and Simplified Chinese labels cover every region and structure.
- API Extractor or equivalent public-contract snapshot is enabled before `0.1.0`.
- The synthetic pack remains clearly identified as non-medical test geometry.
