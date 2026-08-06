import type { CSSProperties } from "react";
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
 * Props for the {@link SomakineViewer} React component.
 *
 * Most props mirror the framework-neutral {@link CreateSomakineOptions} and are
 * read once when the viewer is created. To swap the dataset, background, initial
 * view, or asset resolver, remount the component — for example by changing its
 * `key`. `locale` is also applied at creation; use the imperative handle's
 * `setLocale` for live changes.
 */
export interface SomakineViewerProps {
  /** Validated Somakine data pack to render. */
  dataset: DataPack;
  /** Required accessible label applied to the viewer canvas (`aria-label`). */
  accessibleLabel: string;
  /** Initial locale label language. Defaults to `"en"`. */
  locale?: string;
  /** Canvas clear colour (hex), or `null` for a transparent canvas. */
  background?: string | null;
  /** Initial camera direction in the pack's coordinate system. */
  initialViewDirection?: readonly [number, number, number];
  /** Camera up axis in the pack's coordinate system. */
  initialViewUp?: readonly [number, number, number];
  /** Custom asset byte resolver for GLB data packs. */
  assetResolver?: AssetResolver;
  /** Called when exactly one structure is selected or re-selected. */
  onSelection?: (selection: ViewerSelection) => void;
  /** Called for every selection change (single, multi, or cleared). */
  onSelectionGroup?: (selections: ViewerSelectionGroup) => void;
  /** Called for every viewer lifecycle state transition. */
  onStateChange?: (state: ViewerState) => void;
  /** Called when viewer creation fails for a reason other than unmounting. */
  onError?: (error: unknown) => void;
  /** Class name applied to the host element. */
  className?: string;
  /**
   * Inline style applied to the host element. The host fills its parent by
   * default; the parent (or this style) must provide a height.
   */
  style?: CSSProperties;
}

/**
 * Imperative handle exposed via the component's `ref`.
 *
 * Methods forward to the underlying viewer and are no-ops until the viewer is
 * ready (after `onStateChange` reports the `ready` phase) and after dispose.
 * `canvas` is the viewer-owned canvas element.
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
