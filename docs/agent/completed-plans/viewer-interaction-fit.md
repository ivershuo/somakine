# Somakine viewer interaction and fit tuning

Status: completed on 2026-08-02.

## Goal

Make the BodyParts3D demonstration viewer feel coherent: a control action should visibly affect the intended anatomy, selection state should stay synchronized with the model, and the camera should frame structures with a predictable zoom range and pointer sensitivity.

## Scope

- Tune the shared `@somakine/viewer` camera framing and OrbitControls defaults.
- Make structure focus isolate the selected structure or its declared context while preserving the existing public API.
- Synchronize the vanilla example's region, layer, structure, detail, and status state after every user action.
- Add concise viewport interaction guidance and accessible state descriptions.
- Add regression coverage for the pure camera-fit calculations and run the existing quality gates.

## Non-goals

- No replacement of Three.js, BodyParts3D assets, or the semantic data model.
- No compatibility work for the abandoned Kinexis web application.
- No medical visualization claims or clinical guidance.

## Approach

1. Reproduce the current controls and focus behavior in the running vanilla example.
2. Extract/test deterministic fit math, then use it to set camera clipping and relative orbit limits for both whole-body and focused views.
3. Tune rotate/zoom/pan sensitivity and prevent the browser context menu from stealing right-button panning.
4. Isolate focused geometry in the viewer and make the example reset stale selection/layer state on region/layer changes; synchronize model selections back to the controls.
5. Verify with unit tests, the repository check, and browser DOM/interactions at the built dev server.

## Acceptance criteria

- Whole-body, region, layer, and structure views all start with the visible geometry comfortably inside the viewport.
- Zooming has a useful range for both the whole body and small focused structures; orbit and pan do not feel excessively sensitive.
- Selecting a structure from the list or canvas isolates the same structure/context and updates the details panel and controls.
- Changing region/layer or resetting clears stale selection details and reflects the active view.
- Existing data-pack and viewer tests/builds remain green, with no new console errors in the browser smoke test.

## Verification

- `npm run check` — passed.
- `npm audit --omit=dev` — 0 vulnerabilities.
- Browser smoke test against the vanilla example: initial ready state, structure selection, region/layer changes, reset, locale switch, zoom response, and canvas framing — passed with no warning/error logs.
- Independent security and PR review of the diff — no findings; residual risk is limited to future packs with unusual coordinate scales, covered by the configurable initial view direction and bounds-based fit.

## Risks and rollback

- Camera limits are relative to model bounds; if a future pack has extreme scale, the fit helper should be adjusted without changing the public API.
- Isolating focus changes the prior “keep all anatomy visible” behavior; `showBody()` and `reset()` remain the explicit restoration path.
- The change is isolated to the new Somakine repository and can be reverted as one commit.
