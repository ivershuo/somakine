import type { DataPack, RegionId, Structure, StructureId, StructureType } from "@somakine/core";
import type {
  AssetResolver,
  InteractionMode,
  LateralSide,
  StructureSelectionOptions,
  StructureSide,
  StructureStyle,
  ViewerSelection,
  ViewerSelectionGroup,
  ViewerState,
} from "@somakine/viewer";

/**
 * Imperative handle exposed via the component's template `ref`.
 *
 * Methods forward to the underlying viewer and are no-ops until the viewer is
 * ready (after the `state-change` event reports the `ready` phase) and after
 * dispose. `canvas` is the viewer-owned canvas element.
 */
export interface SomakineViewerHandle {
  /** The viewer's canvas, or `null` before the viewer is ready. */
  readonly canvas: HTMLCanvasElement | null;
  /** `true` once the viewer has been created and not yet disposed. */
  readonly isReady: boolean;
  setLocale(locale: string): void;
  setInteractionMode(mode: InteractionMode): void;
  setLayer(type: StructureType | null): void;
  selectStructure(id: StructureId, options?: StructureSelectionOptions): void;
  selectStructures(ids: readonly StructureId[], options?: StructureSelectionOptions): void;
  focusStructure(id: StructureId, options?: StructureSelectionOptions): void;
  focusRegion(id: RegionId): void;
  setVisible(ids: readonly StructureId[]): void;
  setStructureStyle(id: StructureId, style: StructureStyle | null): void;
  showBody(): void;
  reset(): void;
}

export type {
  AssetResolver,
  DataPack,
  InteractionMode,
  LateralSide,
  RegionId,
  Structure,
  StructureId,
  StructureSelectionOptions,
  StructureSide,
  StructureStyle,
  StructureType,
  ViewerSelection,
  ViewerSelectionGroup,
  ViewerState,
};
