# Anatomy interaction state and drag modes

## Goal

Make the vanilla demonstration page keep Region view, Visual layer, and
Structure selection in one predictable state model; provide an explicit
rotate/pan drag mode; and keep the full anatomy visible while highlighting the
selected structure.

## Scope

- Update the vanilla host to compose region and layer filters instead of
  letting the last command overwrite the previous visibility state.
- Add a non-isolating structure-selection operation to the Viewer and use it
  for pointer and dropdown selection.
- Add a public rotate/pan interaction-mode switch backed by OrbitControls.
- Add a compact drag-mode segmented control and update localized labels/help.
- Add a public per-Structure material style API and document the explicit
  isolate-versus-highlight behavior.

## Non-Goals

- Do not change data-pack semantics or add new anatomy data.
- Keep the existing `focusStructure()` isolation behavior for callers that
  explicitly need focus; the demo selection path will use the new operation.
- Do not add persistent application state or a product-specific interaction
  framework.

## Reproduction and root cause

- Region changes called `focusRegion()` and reset the layer to `all`; layer
  changes called `setLayer()` and discarded the region filter.
- Structure selection called `focusStructure()`, which hid every other group;
  the host then wrote `all` into the layer control without changing the
  actual isolated visibility.
- OrbitControls only mapped left drag to rotation and right drag to pan, with
  no host-visible mode switch.

## Approach

1. Track `regionFilter`, `layerFilter`, and `selectedStructure` in the vanilla
   host and derive one visible structure set from their intersection.
2. Add `selectStructure()` to the Viewer for highlight-only selection; pointer
   hits and the demo dropdown use it, while `focusStructure()` remains an
   explicit isolation API.
3. Add `InteractionMode` and `setInteractionMode()` to map primary/secondary
   drag gestures to rotate or pan modes.
4. Add `StructureStyle` and `setStructureStyle()` for per-Structure color,
   emissive, opacity, and surface parameters.

## Acceptance Criteria

- Changing Region view preserves the chosen Visual layer when possible and
  updates the model using the intersection of both filters.
- Changing Visual layer preserves Region view and clears only an incompatible
  selected structure.
- Selecting a structure updates details and controls without hiding unrelated
  visible anatomy; the selected structure has a distinct emissive/color style.
- `focusStructure()` still supports explicit structure-only isolation.
- Rotate and pan modes switch primary drag behavior and remain keyboard/
  screen-reader discoverable.
- Existing reset behavior remains intact.
- Typecheck, tests, boundary/license/budget checks, and production build pass.

## Verification

- Reproduced before the fix in the running vanilla page: selecting Knee then
  Muscle left both controls selected while the model applied only the muscle
  layer; selecting Femur reset the layer control to All while the model stayed
  isolated to Femur.
- `npm run check` passed: typecheck, 21 tests, boundary/license/budget checks,
  and production build.
- Browser pass confirmed Knee + Muscle intersection, automatic Bone layer
  synchronization for Femur, non-isolating orange selection highlighting,
  working Pan-mode primary drag, localized labels, and no console warnings.

## Risks and Rollback

- Changing pointer selection behavior affects Viewer consumers; isolate the
  new behavior behind `selectStructure()` and leave `focusStructure()` intact.
- OrbitControls mappings can be confusing if labels drift from behavior;
  update localized help from the same mode state.
- Roll back by reverting the interaction commit; no data files are modified.

## Result

Implemented on 2026-08-02. The Viewer now exposes `selectStructure`,
`setStructureStyle`, and `setInteractionMode`; the vanilla example derives one
visibility set from Region and Layer filters and uses highlight-only selection.
