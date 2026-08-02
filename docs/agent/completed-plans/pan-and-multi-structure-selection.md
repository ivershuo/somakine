# Pan-any-direction and multi-Structure selection

## Goal

Make Viewer panning work in every screen direction and expose a public API for
highlighting an arbitrary set of Structures without requiring a Region.

## Scope

- Configure OrbitControls for screen-space panning.
- Add `selectStructures(ids)` and a group-selection callback while preserving
  single-selection and explicit isolation behavior.
- Keep selection styling and clearing consistent for single and multi-selection.
- Update Viewer docs, the example API panel, verification notes, and the
  completed plan.

## Non-Goals

- Do not change Region definitions or DataPack semantics.
- Do not make multi-selection hide geometry; callers can still use
  `focusStructure()` for explicit single-Structure isolation.
- Do not add a new selection UI to the example unless it is needed to document
  and exercise the public API.

## Reproduction and root cause

- The previous Viewer set `OrbitControls.screenSpacePanning = false` while the
  pack uses a Z-up camera. OrbitControls therefore constrained vertical pan to
  the world-up plane instead of the camera screen plane.
- The public Viewer surface only accepted one Structure ID at a time; the
  existing `selectedGroups` array was an internal highlight implementation,
  not a caller-facing multi-selection contract.

## Approach

1. Enable screen-space panning so primary pan drag maps both pointer axes to the
   camera plane regardless of the pack up axis.
2. Add `selectStructures(ids)` that deduplicates valid IDs, unions direct or
   contextual geometry targets, applies the existing selection style to every
   target, and emits a group callback.
3. Route `selectStructure(id)` through the same selection path and preserve the
   existing singular callback for compatibility.
4. Document multi-selection and the independence from Region membership.

## Acceptance Criteria

- Pan mode moves the model view horizontally and vertically with primary drag.
- `selectStructures([idA, idB])` highlights both Structures even when they
  belong to different Regions and leaves unrelated geometry visible.
- Empty and duplicate IDs are handled deterministically; unknown IDs do not
  crash the Viewer.
- Existing `selectStructure`, `focusStructure`, reset, style, and interaction
  mode behavior remain intact.
- Typecheck, tests, boundary/license/budget checks, production build, and a
  browser smoke pass succeed.

## Verification

- Reproduced the vertical-pan bug in the running example: a 130 px vertical
  drag moved the model only about 10 px while `screenSpacePanning` was false.
- Ran `npm run typecheck --pretty false` and `npm test`; all 21 tests passed.
- Rebuilt the Viewer and exercised vertical and diagonal primary drags in Pan
  mode. Both pointer axes now move the model with the drag, and the browser
  console reported no warnings or errors.
- Confirmed the built declaration exposes `ViewerSelectionGroup`,
  `onSelectionGroup`, and `selectStructures`.
- `npm run check` passed the release gate: typecheck, 21 tests, boundaries,
  licenses, budgets, and all package/example builds.

## Risks and Rollback

- Screen-space pan changes the interpretation of the existing pan gesture but
  is the intended behavior for arbitrary-direction movement.
- A new group callback must not alter existing `onSelection` consumers; keep
  it optional and retain the singular callback for single selection.
- Roll back by reverting the interaction commit; no data files are modified.
