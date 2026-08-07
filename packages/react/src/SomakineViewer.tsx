import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  createSomakine,
  type CreateSomakineOptions,
  type SomakineViewer as SomakineViewerInstance,
} from "@somakine/viewer";
import type { SomakineViewerHandle, SomakineViewerProps } from "./types.js";

const HOST_STYLE = { width: "100%", height: "100%" } as const;

/**
 * Build a stable imperative handle that always operates on the latest viewer
 * instance through its ref. The object is created once; its methods read
 * `viewer.current` at call time, so it stays correct across the async creation.
 */
function createViewerHandle(
  viewer: { current: SomakineViewerInstance | null },
): SomakineViewerHandle {
  return {
    get canvas() {
      return viewer.current?.canvas ?? null;
    },
    get isReady() {
      return viewer.current !== null;
    },
    setLocale: (locale) => {
      viewer.current?.setLocale(locale);
    },
    setInteractionMode: (mode) => {
      viewer.current?.setInteractionMode(mode);
    },
    setLayer: (type) => {
      viewer.current?.setLayer(type);
    },
    selectStructure: (id, options) => {
      viewer.current?.selectStructure(id, options);
    },
    selectStructures: (entries, options) => {
      viewer.current?.selectStructures(entries, options);
    },
    focusStructure: (id, options) => {
      viewer.current?.focusStructure(id, options);
    },
    focusRegion: (id) => {
      viewer.current?.focusRegion(id);
    },
    setVisible: (ids, options) => {
      viewer.current?.setVisible(ids, options);
    },
    setStructureStyle: (id, style, options) => {
      viewer.current?.setStructureStyle(id, style, options);
    },
    showBody: () => {
      viewer.current?.showBody();
    },
    reset: () => {
      viewer.current?.reset();
    },
  };
}

/**
 * React component that mounts a Somakine anatomy viewer into its host element.
 *
 * The viewer is created on mount and disposed on unmount. An `AbortController`
 * cancels in-flight creation on unmount or Strict Mode re-invocation. Callback
 * props are read through a ref so the viewer always invokes the latest handler
 * without needing to recreate itself.
 *
 * @example
 * const ref = useRef<SomakineViewerHandle>(null);
 * <SomakineViewer
 *   ref={ref}
 *   dataset={musculoskeletalBasic}
 *   accessibleLabel="Interactive body model"
 *   onStateChange={(state) => setPhase(state.phase)}
 * />;
 */
export const SomakineViewer = forwardRef<SomakineViewerHandle, SomakineViewerProps>(
  function SomakineViewer(props, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<SomakineViewerInstance | null>(null);
    // Keep the latest props so callbacks forward to fresh handlers and so the
    // effect (which runs once) reads mount-time values for creation options.
    const propsRef = useRef(props);
    propsRef.current = props;

    useImperativeHandle(ref, () => createViewerHandle(viewerRef), []);

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const controller = new AbortController();
      let active = true;

      const options: CreateSomakineOptions = {
        dataset: propsRef.current.dataset,
        accessibleLabel: propsRef.current.accessibleLabel,
        signal: controller.signal,
        onSelection: (selection) => {
          propsRef.current.onSelection?.(selection);
        },
        onSelectionGroup: (selections) => {
          propsRef.current.onSelectionGroup?.(selections);
        },
        onStateChange: (state) => {
          propsRef.current.onStateChange?.(state);
        },
      };
      // Optional value props are assigned only when defined so the viewer's own
      // defaults apply otherwise (and to respect `exactOptionalPropertyTypes`).
      const { locale, background, initialViewDirection, initialViewUp, assetResolver } = propsRef.current;
      if (locale !== undefined) options.locale = locale;
      if (background !== undefined) options.background = background;
      if (initialViewDirection) options.initialViewDirection = initialViewDirection;
      if (initialViewUp) options.initialViewUp = initialViewUp;
      if (assetResolver) options.assetResolver = assetResolver;

      createSomakine(host, options)
        .then((instance) => {
          // If the component unmounted before creation resolved, dispose the
          // now-orphaned viewer immediately.
          if (!active) {
            instance.dispose();
            return;
          }
          viewerRef.current = instance;
        })
        .catch((error: unknown) => {
          // Aborts come from unmount/Strict Mode and are expected.
          if (!active || controller.signal.aborted) return;
          propsRef.current.onError?.(error);
        });

      return () => {
        active = false;
        controller.abort();
        const instance = viewerRef.current;
        if (instance) {
          instance.dispose();
          viewerRef.current = null;
        }
      };
    }, []);

    const style = props.style ? { ...HOST_STYLE, ...props.style } : HOST_STYLE;
    return <div ref={hostRef} className={props.className ?? "somakine-host"} style={style} />;
  },
);
