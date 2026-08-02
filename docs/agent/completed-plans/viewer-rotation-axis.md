# Somakine viewer rotation-axis correction

Status: completed on 2026-08-02.

## Goal

Make drag rotation follow the BodyParts3D model's visible anatomical axes while keeping the shared viewer generic for packs with other coordinate conventions.

## Reproduction

- Expected: with the model in its front view, horizontal drag yaws left/right around the model's vertical axis and vertical drag pitches up/down around the screen-horizontal axis.
- Actual: the BodyParts3D model is Z-up, but OrbitControls still uses the camera's default Y-up orientation; a horizontal drag rolled the whole body around the view axis instead of yawing.
- Evidence: browser smoke test on the pre-fix build produced a visibly diagonal, rolled body after a horizontal drag.

## Scope

- Add a validated, optional viewer up-direction configuration next to the existing initial view direction.
- Configure the BodyParts3D example with Z-up and preserve the generic Y-up default for other packs.
- Add a regression test for deterministic coordinate-vector normalization.
- Verify with browser drag screenshots/state and the nearest viewer test suite.

## Non-goals

- No change to BodyParts3D geometry, camera zoom ranges, selection semantics, or interaction sensitivity beyond the rotation-axis correction.
- No compatibility work for Kinexis.

## Acceptance criteria

- BodyParts3D front view rotates around a stable anatomical vertical axis during horizontal/vertical drags.
- The shared viewer remains Y-up by default and accepts a finite non-zero host-provided up vector.
- Invalid up vectors fall back safely without producing a blank or NaN camera.
- Existing quality gates and browser console checks remain clean.

## Verification

- Browser repro before the fix, then front/side/top drag checks after the fix — horizontal drag now yaws and vertical drag pitches without roll; console had no app warnings/errors.
- `npm run check` — passed (17 tests plus boundaries, licenses, budgets, and production build).
- `npm audit --omit=dev` — 0 vulnerabilities.

## Rollback

The change is isolated to the shared viewer option, the BodyParts3D example configuration, tests, docs, and this plan; revert the single commit if a downstream pack needs a different control convention.
