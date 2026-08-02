import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  SomakineCatalog,
  SOMAKINE_MAX_ASSET_BYTES,
  type Asset,
  type CoverageMode,
  type DataPack,
  type GltfAsset,
  type PrimitiveAsset,
  type RegionId,
  type Structure,
  type StructureId,
  type StructureType,
} from "@somakine/core";

export interface ViewerSelection {
  structure: Structure;
  label: string;
  coverage: CoverageMode;
  contextStructureIds: readonly StructureId[];
}

export type ViewerSelectionGroup = readonly ViewerSelection[];

interface HighlightTarget {
  object: THREE.Object3D;
  structureId: StructureId;
}

export type ViewerPhase = "loading" | "ready" | "selected" | "empty" | "error" | "disposed";

export type InteractionMode = "rotate" | "pan";

export interface StructureStyle {
  /** Six-digit hex colour applied to compatible mesh materials. */
  color?: string;
  /** Six-digit hex emissive colour applied when the structure is not selected. */
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  roughness?: number;
  metalness?: number;
}

export interface ViewerState {
  phase: ViewerPhase;
  message: string;
}

export type AssetResolver = (asset: GltfAsset, signal: AbortSignal) => Promise<ArrayBuffer>;

export interface CreateSomakineOptions {
  dataset: DataPack;
  accessibleLabel: string;
  locale?: string;
  /** Initial camera direction in the pack's coordinate system. */
  initialViewDirection?: readonly [number, number, number];
  /** Up axis used by OrbitControls in the pack's coordinate system. */
  initialViewUp?: readonly [number, number, number];
  signal?: AbortSignal;
  assetResolver?: AssetResolver;
  onSelection?: (selection: ViewerSelection) => void;
  onSelectionGroup?: (selections: ViewerSelectionGroup) => void;
  onStateChange?: (state: ViewerState) => void;
  /**
   * Canvas clear colour. Pass `null` when the host wants the canvas to inherit
   * its own surface colour through the renderer's alpha channel.
   */
  background?: string | null;
}

export interface SomakineViewer {
  readonly canvas: HTMLCanvasElement;
  setLocale(locale: string): void;
  setInteractionMode(mode: InteractionMode): void;
  setLayer(type: StructureType | null): void;
  selectStructure(id: StructureId): void;
  selectStructures(ids: readonly StructureId[]): void;
  focusStructure(id: StructureId): void;
  focusRegion(id: RegionId): void;
  setVisible(ids: readonly StructureId[]): void;
  setStructureStyle(id: StructureId, style: StructureStyle | null): void;
  showBody(): void;
  reset(): void;
  dispose(): void;
}

export interface ViewFit {
  distance: number;
  minDistance: number;
  maxDistance: number;
  near: number;
  far: number;
}

/**
 * Calculate camera and orbit limits for a bounding sphere.
 *
 * The horizontal field of view matters on wide viewports while the vertical
 * field of view is the limiting dimension on narrow ones. Keeping this math
 * outside the renderer makes the fit behavior deterministic and testable.
 */
export function calculateViewFit(
  radius: number,
  fovDegrees: number,
  aspect = 1,
  padding = 1.2,
): ViewFit {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;
  const safeFov = THREE.MathUtils.clamp(Number.isFinite(fovDegrees) ? fovDegrees : 38, 1, 179);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const safePadding = Number.isFinite(padding) && padding > 1 ? padding : 1.2;
  const verticalFov = THREE.MathUtils.degToRad(safeFov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance = Math.max(safeRadius / Math.sin(limitingFov / 2) * safePadding, safeRadius * 2);

  return {
    distance,
    minDistance: Math.max(safeRadius * 0.12, 0.001),
    maxDistance: Math.max(safeRadius * 12, distance * 2.75, 0.25),
    near: Math.max(safeRadius * 0.0015, 0.001),
    far: Math.max(safeRadius * 32, distance * 4, 10),
  };
}

export function normalizeViewVector(
  value: readonly [number, number, number] | undefined,
  fallback: readonly [number, number, number],
): readonly [number, number, number] {
  const vector = new THREE.Vector3(...(value ?? fallback));
  if (![vector.x, vector.y, vector.z].every(Number.isFinite) || vector.lengthSq() === 0) {
    vector.set(...fallback);
  }
  if (![vector.x, vector.y, vector.z].every(Number.isFinite) || vector.lengthSq() === 0) {
    throw new TypeError("Somakine view vectors must contain a finite non-zero direction");
  }
  return vector.normalize().toArray() as [number, number, number];
}

export async function createSomakine(container: HTMLElement, options: CreateSomakineOptions): Promise<SomakineViewer> {
  if (!(container instanceof HTMLElement)) throw new TypeError("Somakine container must be an HTMLElement");
  if (!options.accessibleLabel.trim()) throw new TypeError("Somakine accessibleLabel is required");
  if (options.signal?.aborted) throw abortError();

  const catalog = new SomakineCatalog(options.dataset);
  let locale = options.locale ?? "en";
  const internalAbort = new AbortController();
  const canvas = document.createElement("canvas");
  canvas.className = "somakine-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", options.accessibleLabel);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  container.append(canvas);

  let disposed = false;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (error) {
    canvas.remove();
    emitState("error", "WebGL renderer initialization failed");
    throw error;
  }
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (options.background === null) renderer.setClearColor(0x000000, 0);
  else renderer.setClearColor(new THREE.Color(options.background ?? "#0f1717"), 1);

  const scene = new THREE.Scene();
  const model = new THREE.Group();
  model.name = "somakine-model";
  scene.add(model);
  // Use a neutral fill plus a soft camera-facing key so the source geometry
  // keeps its volume without the previous colored rim or back-lighting.
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  const initialViewDirection = normalizeViewVector(options.initialViewDirection, [0, 0.2, 1]);
  let initialViewUp = normalizeViewVector(options.initialViewUp, [0, 1, 0]);
  if (Math.abs(new THREE.Vector3(...initialViewDirection).dot(new THREE.Vector3(...initialViewUp))) > 0.999) {
    initialViewUp = normalizeViewVector(undefined, Math.abs(initialViewDirection[1]) < 0.999 ? [0, 1, 0] : [1, 0, 0]);
  }
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  camera.up.fromArray(initialViewUp);
  // Keep the key in camera space: rotating around the model rotates the light
  // with the canvas, so the newly exposed back never becomes an unlit wall.
  scene.add(camera);
  const key = new THREE.DirectionalLight(0xffffff, 2.45);
  const keyTarget = new THREE.Object3D();
  key.position.set(-3, 2, 4);
  keyTarget.position.set(0, 0, -8);
  key.target = keyTarget;
  camera.add(key, keyTarget);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.enablePan = true;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.45;
  controls.keyPanSpeed = 7;
  // Keep pan movement in the camera's screen plane so vertical and diagonal
  // drags remain useful for packs that use a non-Y-up coordinate system.
  controls.screenSpacePanning = true;
  controls.minPolarAngle = Math.PI * 0.04;
  controls.maxPolarAngle = Math.PI * 0.96;
  let interactionMode: InteractionMode = "rotate";
  applyInteractionMode(controls, interactionMode);
  const initialViewDirectionVector = new THREE.Vector3(...initialViewDirection);
  const groups = new Map<StructureId, THREE.Group>();
  const sourceScenes = new Map<string, Promise<THREE.Object3D>>();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let initialView: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  let selectedTargets: HighlightTarget[] = [];
  let pointerDown: { x: number; y: number } | null = null;
  let pointerDragged = false;

  const onExternalAbort = () => internalAbort.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  const onControlsChange = () => render();
  controls.addEventListener("change", onControlsChange);
  const resizeObserver = new ResizeObserver(() => render());
  resizeObserver.observe(container);
  const onPointerDown = (event: PointerEvent) => {
    pointerDown = { x: event.clientX, y: event.clientY };
    pointerDragged = false;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) pointerDragged = true;
  };
  const onPointerEnd = () => { pointerDown = null };
  const onContextMenu = (event: MouseEvent) => event.preventDefault();
  const onClick = (event: MouseEvent) => {
    if (pointerDragged) { pointerDragged = false; return }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(model, true).find((entry) => typeof entry.object.userData.structureId === "string");
    if (hit) {
      const structureId = hit.object.userData.structureId as StructureId;
      selectPickedObject(hit.object, structureId, event.ctrlKey || event.metaKey);
    }
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("click", onClick);

  emitState("loading", "Loading anatomy");
  try {
    for (const structure of catalog.structures()) {
      const representation = catalog.representation(structure.id)!;
      if (representation.mode !== "direct" && representation.mode !== "compound") continue;
      const group = new THREE.Group();
      group.name = structure.id;
      group.userData.structureId = structure.id;
      for (const instance of catalog.instancesFor(structure.id)) {
        const asset = catalog.asset(instance.assetId);
        if (!asset) throw new Error(`Missing asset ${instance.assetId}`);
        let object: THREE.Object3D;
        if (asset.kind === "primitive") object = createPrimitiveObject(asset);
        else if (instance.selector.kind === "node-name") {
          const source = await loadGltf(asset);
          const selected = findGltfNode(source, instance.selector.value ?? "");
          if (!selected) throw new Error(`Missing glTF node ${instance.selector.value ?? ""}`);
          object = cloneRenderable(selected);
        } else object = cloneRenderable(await loadGltf(asset));
        applyTransform(object, instance.transform);
        markStructure(object, structure.id);
        group.add(object);
      }
      groups.set(structure.id, group);
      model.add(group);
    }
    if (internalAbort.signal.aborted) throw abortError();
    showBody();
    frameObjects([...groups.values()], false);
    initialView = { position: camera.position.clone(), target: controls.target.clone() };
    emitState("ready", "Anatomy ready");
    render();
  } catch (error) {
    const wasAborted = internalAbort.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
    dispose();
    if (wasAborted) throw abortError();
    throw error;
  } finally {
    for (const source of sourceScenes.values()) source.then(disposeObject3D).catch(() => undefined);
  }

  return {
    canvas,
    setLocale,
    setInteractionMode,
    setLayer,
    selectStructure,
    selectStructures,
    focusStructure,
    focusRegion,
    setVisible,
    setStructureStyle,
    showBody,
    reset,
    dispose,
  };

  function setLocale(nextLocale: string): void {
    ensureActive();
    if (!nextLocale.trim()) throw new TypeError("Somakine locale must be non-empty");
    locale = nextLocale;
  }

  function setInteractionMode(nextMode: InteractionMode): void {
    ensureActive();
    if (nextMode !== "rotate" && nextMode !== "pan") throw new TypeError("Somakine interaction mode must be rotate or pan");
    interactionMode = nextMode;
    applyInteractionMode(controls, interactionMode);
    render();
  }

  async function loadGltf(asset: GltfAsset): Promise<THREE.Object3D> {
    let pending = sourceScenes.get(asset.id);
    if (!pending) {
      pending = (async () => {
        const resolver = options.assetResolver ?? defaultAssetResolver;
        const bytes = await resolver(asset, internalAbort.signal);
        await verifyAssetBytes(asset, bytes);
        if (asset.mediaType !== "model/gltf-binary") throw new Error("Default Somakine viewer accepts self-contained binary GLB assets only");
        assertSelfContainedGlb(bytes);
        const gltf = await new GLTFLoader().parseAsync(bytes, "");
        return gltf.scene;
      })();
      sourceScenes.set(asset.id, pending);
    }
    return pending;
  }

  function setLayer(type: StructureType | null): void {
    ensureActive();
    clearHighlight();
    for (const [id, group] of groups) group.visible = type === null || catalog.structure(id)?.type === type;
    const visible = visibleGroups();
    if (visible.length > 0) { frameObjects(visible, true); emitState("ready", type ? `${type} layer` : "All layers") }
    else emitState("empty", type ? `No direct ${type} geometry` : "No visible geometry");
    render();
  }

  function selectStructure(id: StructureId): void {
    selectStructures([id]);
  }

  function selectStructures(ids: readonly StructureId[]): void {
    ensureActive();
    const selections = selectionRecords(ids);
    clearHighlight();
    const targetSet = new Map<THREE.Object3D, HighlightTarget>();
    for (const selection of selections) {
      const representation = catalog.representation(selection.structure.id);
      if (!representation) continue;
      for (const object of selectionTargets(selection.structure.id, representation)) {
        targetSet.set(object, { object, structureId: targetStructureId(object, selection.structure.id) });
      }
    }
    const targets = [...targetSet.values()];
    for (const target of targets) setHighlightedTarget(target, true);
    selectedTargets = targets;
    if (selections.length === 1) {
      const [selection] = selections;
      if (selection) options.onSelection?.(selection);
    }
    options.onSelectionGroup?.(selections);
    const message = selections.length === 0
      ? "No structures selected"
      : selections.length === 1 && selections[0]
        ? `${selections[0].label} · ${selections[0].coverage}`
        : `${selections.length} structures selected`;
    emitState(targets.length > 0 ? "selected" : "empty", message);
    render();
  }

  function selectPickedObject(object: THREE.Object3D, id: StructureId, additive: boolean): void {
    ensureActive();
    const structure = catalog.structure(id);
    const representation = catalog.representation(id);
    if (!structure || !representation) return;
    const target: HighlightTarget = { object, structureId: id };
    const existingIndex = selectedTargets.findIndex((entry) => entry.object === object);
    if (!additive) {
      clearHighlight();
      selectedTargets = [target];
      setHighlightedTarget(target, true);
    } else if (existingIndex >= 0) {
      const [removed] = selectedTargets.splice(existingIndex, 1);
      if (removed) setHighlightedTarget(removed, false);
    } else {
      selectedTargets = [...selectedTargets, target];
      setHighlightedTarget(target, true);
    }
    const selections = selectionRecords(uniqueStructureIds(selectedTargets.map((entry) => entry.structureId)));
    if (selections.length === 1) {
      const [selection] = selections;
      if (selection) options.onSelection?.(selection);
    }
    options.onSelectionGroup?.(selections);
    const message = selections.length === 0
      ? "No structures selected"
      : selections.length === 1 && selections[0]
        ? `${selections[0].label} · ${selections[0].coverage}`
        : `${selections.length} structures selected`;
    emitState(selectedTargets.length > 0 ? "selected" : "empty", message);
    render();
  }

  function focusStructure(id: StructureId): void {
    ensureActive();
    const structure = catalog.structure(id);
    const representation = catalog.representation(id);
    if (!structure || !representation) return;
    clearHighlight();
    const targets = selectionTargets(id, representation);
    const targetSet = new Set(targets);
    for (const group of groups.values()) group.visible = targetSet.has(group);
    for (const group of targets) { group.visible = true; setHighlighted(group, true) }
    selectedTargets = targets.map((object) => ({ object, structureId: targetStructureId(object, id) }));
    if (targets.length > 0) frameObjects(targets, true);
    announceSelection(structure, representation, targets);
  }

  function focusRegion(id: RegionId): void {
    ensureActive();
    clearHighlight();
    const regionStructures = new Set(catalog.structures({ regionId: id }).map((structure) => structure.id));
    for (const [structureId, group] of groups) group.visible = regionStructures.has(structureId);
    const visible = visibleGroups();
    if (visible.length > 0) { frameObjects(visible, true); emitState("ready", catalog.label(id, locale)) }
    else emitState("empty", `${catalog.label(id, locale)} has no direct geometry`);
    render();
  }

  function setVisible(ids: readonly StructureId[]): void {
    ensureActive();
    clearHighlight();
    const wanted = new Set(ids);
    for (const [id, group] of groups) group.visible = wanted.has(id);
    const visible = visibleGroups();
    if (visible.length > 0) { frameObjects(visible, true); emitState("ready", `${visible.length} visible structure groups`) }
    else emitState("empty", "No visible geometry");
    render();
  }

  function setStructureStyle(id: StructureId, style: StructureStyle | null): void {
    ensureActive();
    const group = groups.get(id);
    if (!group) return;
    if (style === null) delete group.userData.somakineStyle;
    else group.userData.somakineStyle = normalizeStructureStyle(style);
    setHighlighted(group, false);
    for (const target of selectedTargets) if (target.structureId === id) setHighlightedTarget(target, true);
    render();
  }

  function showBody(): void {
    ensureActive();
    clearHighlight();
    for (const group of groups.values()) group.visible = true;
    const visible = visibleGroups();
    if (visible.length > 0) frameObjects(visible, true);
    emitState(visible.length > 0 ? "ready" : "empty", "Anatomy ready");
    render();
  }

  function reset(): void {
    ensureActive();
    showBody();
    if (initialView) {
      camera.position.copy(initialView.position);
      controls.target.copy(initialView.target);
      controls.update();
    } else frameObjects([...groups.values()], false);
    emitState("ready", "Anatomy ready");
    render();
  }

  function render(): void {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function frameObjects(objects: readonly THREE.Object3D[], animate: boolean): void {
    const box = new THREE.Box3();
    for (const object of objects) if (object.visible) box.expandByObject(object);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() === 0) direction.copy(initialViewDirectionVector);
    direction.normalize();
    const fit = calculateViewFit(sphere.radius, camera.fov, camera.aspect);
    const nextPosition = sphere.center.clone().add(direction.multiplyScalar(fit.distance));
    camera.near = fit.near;
    camera.far = fit.far;
    camera.updateProjectionMatrix();
    camera.position.copy(nextPosition);
    controls.target.copy(sphere.center);
    controls.minDistance = fit.minDistance;
    controls.maxDistance = fit.maxDistance;
    controls.update();
    if (!animate || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) render();
  }

  function clearHighlight(): void {
    for (const target of selectedTargets) setHighlightedTarget(target, false);
    selectedTargets = [];
  }

  function selectionTargets(id: StructureId, representation: import("@somakine/core").Representation): THREE.Object3D[] {
    return representation.mode === "context"
      ? representation.contextStructureIds.map((contextId) => groups.get(contextId)).filter(isGroup)
      : [groups.get(id)].filter(isGroup);
  }

  function selectionRecords(ids: readonly StructureId[]): ViewerSelection[] {
    return uniqueStructureIds(ids)
      .map((id) => {
        const structure = catalog.structure(id);
        const representation = catalog.representation(id);
        if (!structure || !representation) return undefined;
        return selectionRecord(structure, representation);
      })
      .filter((selection): selection is ViewerSelection => Boolean(selection));
  }

  function targetStructureId(object: THREE.Object3D, fallback: StructureId): StructureId {
    return typeof object.userData.structureId === "string"
      ? object.userData.structureId as StructureId
      : fallback;
  }

  function setHighlightedTarget(target: HighlightTarget, highlighted: boolean): void {
    setHighlighted(target.object, highlighted, structureStyle(target.structureId));
  }

  function structureStyle(id: StructureId): StructureStyle | undefined {
    return groups.get(id)?.userData.somakineStyle as StructureStyle | undefined;
  }

  function selectionRecord(structure: Structure, representation: import("@somakine/core").Representation): ViewerSelection {
    return {
      structure,
      label: catalog.label(structure.id, locale),
      coverage: representation.mode,
      contextStructureIds: representation.contextStructureIds,
    };
  }

  function uniqueStructureIds(ids: readonly StructureId[]): StructureId[] {
    return [...new Set(ids)];
  }

  function announceSelection(
    structure: Structure,
    representation: import("@somakine/core").Representation,
    targets: readonly THREE.Object3D[],
  ): void {
    const selection = selectionRecord(structure, representation);
    options.onSelection?.(selection);
    options.onSelectionGroup?.([selection]);
    emitState(targets.length > 0 ? "selected" : "empty", `${catalog.label(structure.id, locale)} · ${representation.mode}`);
    render();
  }

  function visibleGroups(): THREE.Group[] { return [...groups.values()].filter((group) => group.visible) }
  function ensureActive(): void { if (disposed) throw new Error("Somakine viewer is disposed") }
  function emitState(phase: ViewerPhase, message: string): void { options.onStateChange?.({ phase, message }) }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    internalAbort.abort();
    options.signal?.removeEventListener("abort", onExternalAbort);
    resizeObserver.disconnect();
    controls.removeEventListener("change", onControlsChange);
    controls.dispose();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerEnd);
    canvas.removeEventListener("pointercancel", onPointerEnd);
    canvas.removeEventListener("contextmenu", onContextMenu);
    canvas.removeEventListener("click", onClick);
    disposeObject3D(model);
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    emitState("disposed", "Viewer disposed");
  }
}

export function createPrimitiveObject(asset: PrimitiveAsset): THREE.Object3D {
  const [width, height, depth] = asset.primitive.dimensions;
  let geometry: THREE.BufferGeometry;
  if (asset.primitive.shape === "box") geometry = new THREE.BoxGeometry(width, height, depth);
  else if (asset.primitive.shape === "sphere") {
    geometry = new THREE.SphereGeometry(0.5, 32, 20);
    geometry.scale(width, height, depth);
  } else if (asset.primitive.shape === "cylinder") {
    geometry = new THREE.CylinderGeometry(width / 2, width / 2, height, 24);
    geometry.scale(1, 1, depth / width);
  } else {
    geometry = new THREE.CapsuleGeometry(width / 2, Math.max(0.001, height - width), 8, 16);
    geometry.scale(1, 1, depth / width);
  }
  const material = new THREE.MeshStandardMaterial({ color: asset.primitive.color, roughness: 0.72, metalness: 0.02 });
  return new THREE.Mesh(geometry, material);
}

export function findGltfNode(root: THREE.Object3D, sourceName: string): THREE.Object3D | undefined {
  return root.getObjectByName(sourceName) ?? root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(sourceName));
}

export async function defaultAssetResolver(asset: GltfAsset, signal: AbortSignal): Promise<ArrayBuffer> {
  if (asset.mediaType !== "model/gltf-binary") throw new Error("Default resolver accepts self-contained binary GLB assets only");
  if (asset.bytes > SOMAKINE_MAX_ASSET_BYTES) throw new Error("Asset exceeds the Somakine runtime byte limit");
  const response = await fetch(asset.uri, { signal, credentials: "omit", redirect: "error", cache: "default" });
  if (!response.ok) throw new Error(`Asset request failed (${response.status})`);
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) !== asset.bytes) throw new Error("Asset Content-Length does not match manifest");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Asset response body is unavailable");
  const output = new Uint8Array(asset.bytes);
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.length > asset.bytes) { await reader.cancel(); throw new Error("Asset exceeds declared byte count") }
    output.set(value, offset);
    offset += value.length;
  }
  if (offset !== asset.bytes) throw new Error(`Asset byte mismatch: expected ${asset.bytes}, received ${offset}`);
  return output.buffer;
}

export async function verifyAssetBytes(asset: GltfAsset, bytes: ArrayBuffer): Promise<void> {
  if (asset.bytes > SOMAKINE_MAX_ASSET_BYTES) throw new Error("Asset exceeds the Somakine runtime byte limit");
  if (bytes.byteLength !== asset.bytes) throw new Error(`Asset byte mismatch: expected ${asset.bytes}, received ${bytes.byteLength}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (hex !== asset.sha256) throw new Error("Asset SHA-256 mismatch");
}

export function assertSelfContainedGlb(bytes: ArrayBuffer): void {
  if (bytes.byteLength < 20) throw new Error("GLB is too short");
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Invalid GLB magic");
  if (view.getUint32(4, true) !== 2) throw new Error("Unsupported GLB version");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error("GLB declared length does not match asset bytes");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength === 0 || 20 + jsonLength > bytes.byteLength) {
    throw new Error("GLB has an invalid JSON chunk");
  }
  let document: unknown;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes, 20, jsonLength)).replace(/[\u0000\u0020]+$/u, "");
    document = JSON.parse(json);
  } catch {
    throw new Error("GLB JSON chunk is invalid");
  }
  if (!isJsonRecord(document) || !isJsonRecord(document.asset) || document.asset.version !== "2.0") {
    throw new Error("GLB must contain a glTF 2.0 document");
  }
  rejectExternalUris(document);
}

function rejectExternalUris(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) rejectExternalUris(entry);
    return;
  }
  if (!isJsonRecord(value)) return;
  if (Object.hasOwn(value, "uri")) throw new Error("GLB must not contain external or data URIs");
  for (const entry of Object.values(value)) rejectExternalUris(entry);
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}

function cloneRenderable(root: THREE.Object3D): THREE.Object3D {
  const clone = root.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
  });
  return clone;
}

function applyTransform(object: THREE.Object3D, transform: import("@somakine/core").Transform | undefined): void {
  if (!transform) return;
  if (transform.position) object.position.fromArray(transform.position);
  if (transform.rotation) object.rotation.set(...transform.rotation, object.rotation.order);
  if (transform.scale) object.scale.fromArray(transform.scale);
}

function applyInteractionMode(controls: OrbitControls, mode: InteractionMode): void {
  // The primary drag is the mode selected by the host. Keep the secondary
  // drag available for the opposite operation so the canvas remains useful
  // without requiring a modifier key.
  controls.mouseButtons.LEFT = mode === "rotate" ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  controls.mouseButtons.RIGHT = mode === "rotate" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
}

function markStructure(object: THREE.Object3D, structureId: StructureId): void {
  object.traverse((child) => { child.userData.structureId = structureId });
}

const STYLE_COLOR = /^#[0-9a-fA-F]{6}$/;
const HIGHLIGHT_COLOR = "#e19a5b";
const HIGHLIGHT_EMISSIVE = "#6b3d20";
const HIGHLIGHT_EMISSIVE_INTENSITY = 0.9;
const BASE_STYLE_KEY = "somakineBaseStyle";

interface BaseMaterialStyle {
  color: number;
  emissive?: number;
  emissiveIntensity?: number;
  opacity: number;
  transparent: boolean;
  roughness?: number;
  metalness?: number;
}

interface HighlightMaterial extends THREE.Material {
  color: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
}

function normalizeStructureStyle(style: StructureStyle): StructureStyle {
  if (!style || typeof style !== "object") throw new TypeError("Somakine structure style must be an object or null");
  const next = { ...style };
  for (const key of ["color", "emissive"] as const) {
    if (next[key] !== undefined && (typeof next[key] !== "string" || !STYLE_COLOR.test(next[key]))) {
      throw new TypeError(`Somakine ${key} style must be a six-digit hex colour`);
    }
  }
  if (next.emissiveIntensity !== undefined && (!Number.isFinite(next.emissiveIntensity) || next.emissiveIntensity < 0)) {
    throw new TypeError("Somakine emissiveIntensity must be a finite non-negative number");
  }
  if (next.opacity !== undefined && (!Number.isFinite(next.opacity) || next.opacity < 0 || next.opacity > 1)) {
    throw new TypeError("Somakine opacity must be between 0 and 1");
  }
  for (const key of ["roughness", "metalness"] as const) {
    if (next[key] !== undefined && (!Number.isFinite(next[key]) || next[key] < 0 || next[key] > 1)) {
      throw new TypeError(`Somakine ${key} must be between 0 and 1`);
    }
  }
  if (next.transparent !== undefined && typeof next.transparent !== "boolean") {
    throw new TypeError("Somakine transparent style must be boolean");
  }
  return next;
}

function setHighlighted(root: THREE.Object3D, highlighted: boolean, style = root.userData.somakineStyle as StructureStyle | undefined): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const highlightMaterial = asHighlightMaterial(material);
      if (highlightMaterial) applyMaterialAppearance(highlightMaterial, style, highlighted);
    }
  });
}

function asHighlightMaterial(material: THREE.Material): HighlightMaterial | null {
  const candidate = material as unknown as Partial<HighlightMaterial>;
  return candidate.color instanceof THREE.Color ? candidate as HighlightMaterial : null;
}

function applyMaterialAppearance(material: HighlightMaterial, style: StructureStyle | undefined, highlighted: boolean): void {
  const base = material.userData[BASE_STYLE_KEY] as BaseMaterialStyle | undefined ?? captureBaseStyle(material);
  material.color.set(highlighted ? HIGHLIGHT_COLOR : style?.color ?? base.color);
  const emissive = highlighted ? HIGHLIGHT_EMISSIVE : style?.emissive ?? base.emissive;
  if (material.emissive && emissive !== undefined) material.emissive.set(emissive);
  if (material.emissiveIntensity !== undefined) {
    material.emissiveIntensity = highlighted
      ? HIGHLIGHT_EMISSIVE_INTENSITY
      : style?.emissiveIntensity ?? base.emissiveIntensity ?? material.emissiveIntensity;
  }
  material.opacity = style?.opacity ?? base.opacity;
  material.transparent = style?.transparent ?? (style?.opacity !== undefined && style.opacity < 1 ? true : base.transparent);
  if (material.roughness !== undefined) material.roughness = style?.roughness ?? base.roughness ?? material.roughness;
  if (material.metalness !== undefined) material.metalness = style?.metalness ?? base.metalness ?? material.metalness;
  material.needsUpdate = true;
}

function captureBaseStyle(material: HighlightMaterial): BaseMaterialStyle {
  const base: BaseMaterialStyle = {
    color: material.color.getHex(),
    opacity: material.opacity,
    transparent: material.transparent,
    ...(material.emissive ? { emissive: material.emissive.getHex() } : {}),
    ...(material.emissiveIntensity !== undefined ? { emissiveIntensity: material.emissiveIntensity } : {}),
    ...(material.roughness !== undefined ? { roughness: material.roughness } : {}),
    ...(material.metalness !== undefined ? { metalness: material.metalness } : {}),
  };
  material.userData[BASE_STYLE_KEY] = base;
  return base;
}

function isGroup(value: THREE.Group | undefined): value is THREE.Group { return value instanceof THREE.Group }
function abortError(): DOMException { return new DOMException("Somakine initialization aborted", "AbortError") }

export type { Asset };
