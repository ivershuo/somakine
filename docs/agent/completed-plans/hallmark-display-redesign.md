# Hallmark display redesign

## Scope

Refresh the Somakine vanilla anatomy display page using a restrained,
low-saturation modern-minimal workbench while keeping the viewer and control
logic unchanged.

## Work items

- [x] Replace the oversized, gradient-led visual hierarchy with a compact hero and bounded workbench.
- [x] Centralize OKLCH palette, typography, spacing, motion, radius, and size tokens in root `tokens.css`.
- [x] Preserve all controls, model status, semantic details, and BodyParts3D attribution.
- [x] Verify the desktop page and keep narrow layouts from introducing horizontal overflow.
- [x] Run project typecheck/build/tests and Hallmark slop/contrast checks.
- [x] Let the host surface carry the model canvas background so the preview no longer breaks from the page.
- [x] Remove colored/rim lighting and use neutral ambient fill with a camera-relative key for readable depth from every view.

## Acceptance criteria

- No high-saturation fills, radial/mesh gradients, oversized display type, or decorative chrome.
- Focus and selected states remain visually clear and keyboard-accessible.
- The model remains the visual focus and all existing interaction affordances remain available.
- CSS uses named tokens for every color and font-family declaration.
