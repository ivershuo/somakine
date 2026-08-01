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

export type ViewerPhase = "loading" | "ready" | "selected" | "empty" | "error" | "disposed";

export interface ViewerState {
  phase: ViewerPhase;
  message: string;
}

export type AssetResolver = (asset: GltfAsset, signal: AbortSignal) => Promise<ArrayBuffer>;

export interface CreateSomakineOptions {
  dataset: DataPack;
  accessibleLabel: string;
  locale?: string;
  signal?: AbortSignal;
  assetResolver?: AssetResolver;
  onSelection?: (selection: ViewerSelection) => void;
  onStateChange?: (state: ViewerState) => void;
  background?: string;
}

export interface SomakineViewer {
  readonly canvas: HTMLCanvasElement;
  setLocale(locale: string): void;
  setLayer(type: StructureType | null): void;
  focusStructure(id: StructureId): void;
  focusRegion(id: RegionId): void;
  setVisible(ids: readonly StructureId[]): void;
  showBody(): void;
  reset(): void;
  dispose(): void;
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
  renderer.setClearColor(new THREE.Color(options.background ?? "#0f1717"), 1);

  const scene = new THREE.Scene();
  const model = new THREE.Group();
  model.name = "somakine-model";
  scene.add(model);
  scene.add(new THREE.HemisphereLight(0xf7f0df, 0x263c3b, 2.8));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(3, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fd8c3, 1.4);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.enablePan = true;
  controls.minPolarAngle = Math.PI * 0.06;
  controls.maxPolarAngle = Math.PI * 0.94;
  const groups = new Map<StructureId, THREE.Group>();
  const sourceScenes = new Map<string, Promise<THREE.Object3D>>();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let initialView: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  let selectedGroups: THREE.Group[] = [];
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
  const onClick = (event: MouseEvent) => {
    if (pointerDragged) { pointerDragged = false; return }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(model, true).find((entry) => typeof entry.object.userData.structureId === "string");
    if (hit) focusStructure(hit.object.userData.structureId as StructureId);
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
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

  return { canvas, setLocale, setLayer, focusStructure, focusRegion, setVisible, showBody, reset, dispose };

  function setLocale(nextLocale: string): void {
    ensureActive();
    if (!nextLocale.trim()) throw new TypeError("Somakine locale must be non-empty");
    locale = nextLocale;
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

  function focusStructure(id: StructureId): void {
    ensureActive();
    const structure = catalog.structure(id);
    const representation = catalog.representation(id);
    if (!structure || !representation) return;
    clearHighlight();
    const targets = representation.mode === "context"
      ? representation.contextStructureIds.map((contextId) => groups.get(contextId)).filter(isGroup)
      : [groups.get(id)].filter(isGroup);
    for (const group of targets) { group.visible = true; setHighlighted(group, true) }
    selectedGroups = targets;
    if (targets.length > 0) frameObjects(targets, true);
    options.onSelection?.({
      structure,
      label: catalog.label(id, locale),
      coverage: representation.mode,
      contextStructureIds: representation.contextStructureIds,
    });
    emitState(targets.length > 0 ? "selected" : "empty", `${catalog.label(id, locale)} · ${representation.mode}`);
    render();
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

  function showBody(): void {
    ensureActive();
    clearHighlight();
    for (const group of groups.values()) group.visible = true;
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
    if (direction.lengthSq() === 0) direction.set(0, 0.2, 1);
    direction.normalize();
    const distance = Math.max(sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.15, 0.5);
    const nextPosition = sphere.center.clone().add(direction.multiplyScalar(distance));
    camera.position.copy(nextPosition);
    controls.target.copy(sphere.center);
    controls.minDistance = Math.max(sphere.radius * 0.35, 0.05);
    controls.maxDistance = Math.max(sphere.radius * 6, 2);
    controls.update();
    if (!animate || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) render();
  }

  function clearHighlight(): void {
    for (const group of selectedGroups) setHighlighted(group, false);
    selectedGroups = [];
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

function markStructure(object: THREE.Object3D, structureId: StructureId): void {
  object.traverse((child) => { child.userData.structureId = structureId });
}

function setHighlighted(root: THREE.Object3D, highlighted: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (!material.userData.somakineBaseEmissive) material.userData.somakineBaseEmissive = material.emissive.getHex();
      material.emissive.setHex(highlighted ? 0x375a4c : material.userData.somakineBaseEmissive as number);
      material.emissiveIntensity = highlighted ? 0.85 : 1;
    }
  });
}

function isGroup(value: THREE.Group | undefined): value is THREE.Group { return value instanceof THREE.Group }
function abortError(): DOMException { return new DOMException("Somakine initialization aborted", "AbortError") }

export type { Asset };
