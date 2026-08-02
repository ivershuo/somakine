# MIT license migration

## Goal

License Somakine-owned framework code and synthetic fixtures under MIT while
preserving the original license and attribution boundaries for BodyParts3D and
any future third-party data packs.

## Scope

- Replace repository and code-package Apache-2.0 declarations with MIT.
- Keep BodyParts3D geometry, derived data, manifests, and runtime assets under
  CC BY 4.0 with explicit attribution.
- Update package metadata, NOTICE, documentation, license checks, and tests.
- Document the distinction between framework code licenses and data-pack
  licenses for future user-provided extensions.

## Non-Goals

- Do not relicense BodyParts3D or any other third-party data.
- Do not change dependency licenses or vendor third-party source code.
- Do not implement the multi-pack extension/composition API in this change.
- Do not change runtime rendering, schema semantics, or asset contents.

## Approach

1. Added the canonical MIT text and updated code-owned package metadata.
2. Kept the BodyParts3D data package and source license files explicitly CC BY
   4.0; license checks now enforce the mixed boundary.
3. Updated repository documentation, contribution guidance, and the foundation
   plan to describe the new code/data boundary.
4. Added a focused synthetic-pack MIT assertion and ran the complete quality
   gate.

## Acceptance Criteria

- Root license and all framework-owned package manifests identify MIT.
- BodyParts3D package metadata, pack manifests, and license files still identify
  CC-BY-4.0 and retain the required attribution.
- No stale Apache-2.0 project-license claim remains in current public project
  documentation.
- License and attribution checks reject accidental relicensing of BodyParts3D.
- Typecheck, tests, boundary checks, license checks, budget checks, and the
  production build pass.

## Verification

- `npm run check` — passed.
- `git diff --check` — passed.
- Synthetic pack tests assert the MIT license record.

## Risks and Rollback

- Existing external contributors may not have agreed to a new license; verify
  the repository copyright chain before publishing the MIT release.
- MIT does not provide Apache-2.0's explicit patent grant; revert the code-only
  declarations to Apache-2.0 if patent coverage becomes a release requirement.
- Roll back by reverting the migration commit; third-party data files were not
  changed by the migration.

## Result

Implemented on 2026-08-02. Framework packages, the synthetic fixture, and the
vanilla example are MIT-licensed. The BodyParts3D data pack remains CC BY 4.0,
with its attribution, source manifests, and generated asset notices intact.
