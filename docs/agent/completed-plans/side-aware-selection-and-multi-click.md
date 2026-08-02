# Side-aware selection and modifier-key multi-select

## Goal

Make canvas picking select only the clicked side of bilateral geometry, allow
Ctrl/Cmd-click to toggle multiple picked anatomy units, and make the selected
style visible across standard mesh material variants used by bones, muscles,
ligaments, and tendons.

## Scope

- Preserve the public semantic APIs (`selectStructure` and
  `selectStructures`) while adding a picked-object selection path for canvas
  clicks.
- Track highlighted targets as render objects rather than only top-level
  structure groups so a bilateral source node can be selected on one side.
- Use `ctrlKey`/`metaKey` to toggle picked targets without modifier replacement
  and keep ordinary clicks as single selection.
- Apply highlight appearance to every mesh material with a color channel and
  optional emissive/surface channels, not only one Three.js material class.
- Update the vanilla interaction guidance and Viewer documentation.

## Non-Goals

- Do not split or rename the canonical semantic Structure IDs in the data pack.
- Do not change `selectStructure`/`selectStructures` programmatic semantics:
  they continue to highlight the full geometry represented by each semantic
  Structure, including a declared bilateral representation.
- Do not add a separate multi-select control or modifier-specific UI panel.

## Reproduction and root cause

- In the vanilla example, filtering to Ankle & foot and clicking one distal
  phalanx highlighted both left and right bones. The asset selector resolves
  the bilateral parent node (for example, `ankle-foot:distal-phalanx-of-big-
  toe`) and `markStructure` assigns the same Structure ID to both child meshes;
  pointer selection then called `selectStructure`, which highlighted the whole
  group.
- Every pointer click currently replaces `selectedGroups` and ignores
  `MouseEvent.ctrlKey`/`metaKey`, so canvas multi-selection is impossible.
- Runtime tracing confirmed supplemental connective geometry is loaded as
  `MeshStandardMaterial` and the highlight color is written, but the current
  implementation is class-gated and cannot guarantee behavior for other
  material variants/data packs. The style path will be generalized and checked
  against muscle and ligament examples.

## Approach

1. Introduce an internal highlight-target record containing a render object and
   its Structure ID; use it for clear, re-style, programmatic selection, and
   focus operations.
2. Add a pointer-specific selection function that uses the raycast hit mesh as
   the target. Ordinary click replaces targets; Ctrl/Cmd-click toggles the hit
   target and preserves other targets. Keep callbacks deduplicated by semantic
   Structure ID while maintaining existing single-selection compatibility.
3. Generalize material appearance capture/application to color-bearing Three.js
   materials, with optional emissive/roughness/metalness properties preserved.
4. Update help/documentation and verify target toggling, side-specific picking,
   and material compatibility through the browser smoke path and repository
   quality gates.

## Acceptance Criteria

- Clicking one side of a bilateral toe/foot mesh highlights only that picked
  side; the opposite side keeps its base appearance.
- Ctrl-click or Cmd-click on multiple meshes keeps each picked target
  highlighted; clicking an already selected target removes it. A normal click
  clears the previous picked set and selects only the new target.
- Existing pointer/dropdown selection callbacks remain valid and programmatic
  `selectStructures` still supports arbitrary cross-Region IDs.
- Muscle, ligament, tendon, and bone meshes visibly receive the same highlight
  treatment; custom per-Structure styles still restore correctly.
- Typecheck, tests, boundary/license/budget checks, production build, browser
  interaction smoke, and console checks pass.

## Verification

- Before the fix, one distal phalanx click changed both bilateral meshes. After
  the fix, the same click changed only the raycast side; the opposite toe kept
  its base colour.
- Browser smoke verified Ctrl-click and Cmd-click each add a second picked
  structure, and repeating the modifier click removes that target. The example
  reports `2 structures selected` and returns to the remaining selection.
- Browser smoke verified the shared material path for a compound muscle
  (Deltoid) and a supplemental ligament (Right long plantar ligament); both
  resolve through the same colour/emissive highlight implementation.
- `npm run check` passed typecheck, all 21 tests, boundary/license/budget
  checks, and the production build. The build emitted only the existing bundle
  size advisory.

## Risks and Rollback

- Mesh-level pointer highlighting changes only canvas-pick behavior; public
  semantic API behavior remains group-level to avoid breaking host callers.
- Modifier state must be read from the click event after OrbitControls has
  completed its drag path; the existing drag guard prevents accidental picks.
- Roll back the single implementation commit; no data or asset files need to
  change.
