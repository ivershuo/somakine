# Somakine

> The open body framework.

Somakine is a framework-neutral TypeScript foundation for interactive human
anatomy products. It separates anatomical identity, visual representations,
mesh instances, assets, provenance, and product content so education, fitness,
and rehabilitation experiences can share one honest body layer without sharing
an application architecture.

## Alpha capabilities

- canonical anatomy IDs and many-to-many regions;
- strict data-pack validation and deterministic catalog queries;
- direct, compound, contextual, and unavailable visual coverage;
- source, license, attribution, digest, and geometry-budget contracts;
- a Three.js viewer with layers, picking, focus, reset, abort, and disposal;
- a BodyParts3D adapter boundary;
- a CLI for validation, inspection, coverage, and asset verification;
- a standalone vanilla example using a synthetic musculoskeletal pack.

The synthetic pack proves the framework contract; it is not a medical anatomy
model. The first real BodyParts3D pack is the next data milestone.

See [the foundation plan](docs/FOUNDATION_PLAN.md) for the implemented alpha
scope and the acceptance criteria for the first real anatomy pack.

## Quick start

```sh
npm install
npm run check
npm run dev
```

Then open the local URL printed by Vite.

## Packages

- `@somakine/core` — schema, validation, catalog, and public types.
- `@somakine/viewer` — framework-neutral Three.js viewer.
- `@somakine/bodyparts3d` — BodyParts3D provenance and adapter helpers.
- `@somakine/cli` — `soma` validation and inspection commands.
- `@somakine/musculoskeletal-basic` — synthetic alpha fixture and demo pack.

## Safety and scope

Somakine is infrastructure, not medical advice, diagnosis, treatment, exercise
prescription, or a substitute for professional care. Data packs must disclose
their sources, licenses, review state, and unavailable geometry.

## License

Framework code is licensed under Apache-2.0. Data packs and visual assets retain
their own licenses and attribution requirements. See [NOTICE](NOTICE).
