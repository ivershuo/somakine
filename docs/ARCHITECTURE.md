# Architecture

Somakine separates semantic anatomy from visual representation and downstream
product content.

```text
data pack JSON / TypeScript
        ↓ strict validation
@somakine/core
  structures, regions, relations, representations, instances, assets
        ↓ semantic commands and state
@somakine/viewer
  Three.js scene, loading, picking, focus, lifecycle
        ↓ callbacks
host product
  routes, UI, learning content, fitness or rehabilitation experience
```

Developer data follows the same boundary:

```text
base DataPack + DataExtension[]
        ↓ mapping, provenance, conflict policy, validation
composeDataPacks()
        ↓ ordinary DataPack
@somakine/viewer
```

`@somakine/bodyparts3d` is an adapter, not a privileged core dependency. A
second anatomy source must fit the same core contract without changing core
types.

## Boundaries

- Core has no DOM, Three.js, filesystem, network, or product-content dependency.
- Viewer owns only canvas/scene state and semantic events.
- Hosts own markup, accessibility wording, navigation, prose, and safety policy.
- Data packs own anatomy coverage and localization; assets own provenance and
  license records.
- Extensions own their namespaces, source/license records, and asset paths;
  composition never erases those records.
- Schema version and data-pack version change independently.

## Identity

A structure is a semantic concept. A region is a view. A representation states
whether that structure has direct, compound, contextual, or unavailable visual
coverage. A mesh instance describes the actual scene object. These records must
never be collapsed into a region-specific product ID.
