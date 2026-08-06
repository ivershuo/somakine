import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, type PropType } from "vue";
import {
  createSomakine,
  type AssetResolver,
  type CreateSomakineOptions,
  type SomakineViewer as SomakineViewerInstance,
  type ViewerSelection,
  type ViewerSelectionGroup,
  type ViewerState,
} from "@somakine/viewer";
import type { DataPack } from "@somakine/core";
import type { SomakineViewerHandle } from "./types.js";

/**
 * Vue 3 component that mounts a Somakine anatomy viewer into its host element.
 *
 * The viewer is created on mount and disposed on unmount. An `AbortController`
 * cancels in-flight creation on unmount. Events are emitted for selection and
 * lifecycle state changes; the imperative handle is exposed via the template
 * `ref`.
 *
 * Rendered with a `defineComponent` + `h()` render function so the package ships
 * as plain ESM (no `.vue` single-file compiler required by the host build).
 *
 * @example
 * <SomakineViewer
 *   ref="viewer"
 *   :dataset="musculoskeletalBasic"
 *   accessible-label="Interactive body model"
 *   style="height: 32rem"
 *   @selection="onSelection"
 *   @state-change="onStateChange"
 * />
 */
export const SomakineViewer = defineComponent({
  name: "SomakineViewer",
  props: {
    dataset: { type: Object as PropType<DataPack>, required: true },
    accessibleLabel: { type: String, required: true },
    locale: { type: String },
    background: { type: String as PropType<string | null> },
    initialViewDirection: { type: Array as unknown as PropType<readonly [number, number, number]> },
    initialViewUp: { type: Array as unknown as PropType<readonly [number, number, number]> },
    assetResolver: { type: Function as PropType<AssetResolver> },
  },
  emits: {
    selection: (_payload: ViewerSelection) => true,
    selectionGroup: (_payload: ViewerSelectionGroup) => true,
    stateChange: (_payload: ViewerState) => true,
    error: (_payload: unknown) => true,
  },
  setup(props, { expose, emit }) {
    const host = shallowRef<HTMLDivElement | null>(null);
    const controller = new AbortController();
    let viewer: SomakineViewerInstance | null = null;

    onMounted(() => {
      const element = host.value;
      if (!element) return;
      const options: CreateSomakineOptions = {
        dataset: props.dataset,
        accessibleLabel: props.accessibleLabel,
        signal: controller.signal,
        onSelection: (selection) => {
          emit("selection", selection);
        },
        onSelectionGroup: (selections) => {
          emit("selectionGroup", selections);
        },
        onStateChange: (state) => {
          emit("stateChange", state);
        },
      };
      // Optional value props are assigned only when defined so the viewer's own
      // defaults apply otherwise (and to respect `exactOptionalPropertyTypes`).
      if (props.locale !== undefined) options.locale = props.locale;
      if (props.background !== undefined) options.background = props.background;
      if (props.initialViewDirection) options.initialViewDirection = props.initialViewDirection;
      if (props.initialViewUp) options.initialViewUp = props.initialViewUp;
      if (props.assetResolver) options.assetResolver = props.assetResolver;

      createSomakine(element, options)
        .then((instance) => {
          viewer = instance;
        })
        .catch((error: unknown) => {
          // Aborts come from unmounting and are expected.
          if (controller.signal.aborted) return;
          emit("error", error);
        });
    });

    onBeforeUnmount(() => {
      controller.abort();
      if (viewer) {
        viewer.dispose();
        viewer = null;
      }
    });

    expose({
      get canvas() {
        return viewer?.canvas ?? null;
      },
      get isReady() {
        return viewer !== null;
      },
      setLocale: (locale) => {
        viewer?.setLocale(locale);
      },
      setInteractionMode: (mode) => {
        viewer?.setInteractionMode(mode);
      },
      setLayer: (type) => {
        viewer?.setLayer(type);
      },
      selectStructure: (id, options) => {
        viewer?.selectStructure(id, options);
      },
      selectStructures: (ids, options) => {
        viewer?.selectStructures(ids, options);
      },
      focusStructure: (id, options) => {
        viewer?.focusStructure(id, options);
      },
      focusRegion: (id) => {
        viewer?.focusRegion(id);
      },
      setVisible: (ids) => {
        viewer?.setVisible(ids);
      },
      setStructureStyle: (id, style) => {
        viewer?.setStructureStyle(id, style);
      },
      showBody: () => {
        viewer?.showBody();
      },
      reset: () => {
        viewer?.reset();
      },
    } satisfies SomakineViewerHandle);

    return () => h("div", { ref: host, class: "somakine-host", style: { width: "100%", height: "100%" } });
  },
});
