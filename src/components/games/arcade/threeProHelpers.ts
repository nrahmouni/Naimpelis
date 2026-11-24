import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { resolveGameAssetUrl } from '../../../shared/gameAssetsCdn';
import { applyFresnelRimToGroup, attachSafeMeshDecoders } from './threePostFxHelpers';

const GLTF_CACHE = new Map<string, Promise<GLTF | null>>();
const TEXTURE_CACHE = new Map<string, Promise<THREE.Texture | null>>();
const sharedGltfLoader = new GLTFLoader();
sharedGltfLoader.setCrossOrigin('anonymous');
attachSafeMeshDecoders(sharedGltfLoader);
const sharedTextureLoader = new THREE.TextureLoader();
sharedTextureLoader.setCrossOrigin('anonymous');

export function getMaxSafeAnisotropy(
  renderer: THREE.WebGLRenderer | null | undefined,
  isSoftwareGl: boolean
): number {
  if (isSoftwareGl || !renderer) return 1;
  try {
    return Math.max(4, Math.min(16, renderer.capabilities.getMaxAnisotropy()));
  } catch {
    return 4;
  }
}

export function isConstrainedTvDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Tizen|SMART-TV|SmartTV|Web0S|webOS|NetCast|BRAVIA|AFT|HbbTV|Viera/i.test(
    navigator.userAgent || ''
  );
}

export function observeHostResize(
  host: HTMLElement,
  onResize: (w: number, h: number) => void
): () => void {
  const fire = () => {
    const w = Math.max(160, host.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 960));
    const h = Math.max(120, host.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 540));
    onResize(w, h);
  };
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(fire);
    ro.observe(host);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', fire);
  }
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fire) : 0;
  return () => {
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    ro?.disconnect();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', fire);
    }
  };
}

export function detectSoftwareGl(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const c = document.createElement('canvas');
    const gl =
      (c.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (c.getContext('webgl') as WebGLRenderingContext | null) ||
      (c.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createResilientWebGlRenderer(
  isSoftwareGl: boolean,
  opts?: { alpha?: boolean; exposure?: number }
): THREE.WebGLRenderer | null {
  const tvConstrained = isConstrainedTvDevice();
  try {
    const renderer = new THREE.WebGLRenderer({
      alpha: Boolean(opts?.alpha),
      antialias: !isSoftwareGl && !tvConstrained,
      powerPreference: isSoftwareGl || tvConstrained ? 'default' : 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = opts?.exposure ?? 1.1;
    renderer.setPixelRatio(
      isSoftwareGl || tvConstrained ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = tvConstrained ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    return renderer;
  } catch {
    return null;
  }
}

export function initRoomEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer
): { dispose: () => void } {
  let envRt: THREE.WebGLRenderTarget | null = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    envRt = pmrem.fromScene(room, 0.04);
    scene.environment = envRt.texture;
    room.dispose();
    pmrem.dispose();
  } catch {
    envRt?.dispose();
    envRt = null;
  }
  return {
    dispose: () => {
      envRt?.dispose();
      envRt = null;
    },
  };
}

export interface FramePacerHandle {
  schedule: (tick: () => void) => void;
  cancel: () => void;
}

export function createThreeFramePacer(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean
): FramePacerHandle {
  let rafId = 0;
  let timeoutId = 0;
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutId = 0;
    }
  };

  const afterDraw = (cb: () => void) => {
    try {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (cancelled) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            timeoutId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            timeoutId = window.setTimeout(cb, 80);
          }
        };
        timeoutId = window.setTimeout(poll, 5);
        return;
      }
    } catch {
      // Fallback if WebGL1 context
    }
    timeoutId = window.setTimeout(cb, 80);
  };

  const schedule = (tick: () => void) => {
    cancelled = false;
    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      rafId = requestAnimationFrame(tick);
    }
  };

  return { schedule, cancel };
}

export function loadCachedGltf(relPath: string): Promise<GLTF | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return Promise.resolve(null);
  const url = resolveGameAssetUrl(relPath);
  const hit = GLTF_CACHE.get(url);
  if (hit) return hit;
  const p = new Promise<GLTF | null>((resolve) => {
    sharedGltfLoader.load(
      url,
      (gltf) => resolve(gltf || null),
      undefined,
      () => resolve(null)
    );
  });
  GLTF_CACHE.set(url, p);
  return p;
}

export function loadCachedPbrTexture(
  relPath: string,
  opts?: {
    srgb?: boolean;
    repeatX?: number;
    repeatY?: number;
    anisotropy?: number;
  }
): Promise<THREE.Texture | null> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return Promise.resolve(null);
  const url = resolveGameAssetUrl(relPath);
  const key = `${url}|${opts?.srgb ? 'srgb' : 'lin'}|${opts?.repeatX ?? 1}x${opts?.repeatY ?? 1}`;
  const hit = TEXTURE_CACHE.get(key);
  if (hit) return hit;
  const p = new Promise<THREE.Texture | null>((resolve) => {
    sharedTextureLoader.load(
      url,
      (tex) => {
        tex.colorSpace = opts?.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        if (opts?.repeatX || opts?.repeatY) {
          tex.repeat.set(opts.repeatX ?? 1, opts.repeatY ?? 1);
        }
        if (opts?.anisotropy) {
          tex.anisotropy = opts.anisotropy;
        } else {
          tex.anisotropy = 8;
        }
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
  TEXTURE_CACHE.set(key, p);
  return p;
}

export interface HdriApplyHandle {
  dispose: () => void;
}

export function applyPolyHavenHdri(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  hdriRelPath: string,
  isSoftwareGl: boolean,
  options?: { setBackground?: boolean; backgroundBlur?: number; envIntensity?: number }
): HdriApplyHandle {
  let cancelled = false;
  let envRt: THREE.WebGLRenderTarget | null = null;
  if (typeof window === 'undefined' || typeof fetch === 'undefined' || isSoftwareGl) {
    return { dispose: () => {} };
  }

  try {
    const loader = new RGBELoader();
    loader.setCrossOrigin('anonymous');
    const url = resolveGameAssetUrl(hdriRelPath);
    loader.load(
      url,
      (hdrTex) => {
        if (cancelled) {
          hdrTex.dispose();
          return;
        }
        try {
          const pmrem = new THREE.PMREMGenerator(renderer);
          pmrem.compileEquirectangularShader();
          envRt = pmrem.fromEquirectangular(hdrTex);
          scene.environment = envRt.texture;
          if (typeof options?.envIntensity === 'number' && 'environmentIntensity' in scene) {
            (scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity =
              options.envIntensity;
          }
          if (options?.setBackground) {
            scene.background = envRt.texture;
            if (typeof options.backgroundBlur === 'number') {
              scene.backgroundBlurriness = options.backgroundBlur;
            }
          }
          pmrem.dispose();
        } catch {
          // Keep existing RoomEnvironment fallback on limited WebGL contexts
        } finally {
          hdrTex.dispose();
        }
      },
      undefined,
      () => {
        // Network/CORS fallback silently preserves RoomEnvironment
      }
    );
  } catch {
    // ignore
  }

  return {
    dispose: () => {
      cancelled = true;
      if (envRt) {
        envRt.dispose();
        envRt = null;
      }
    },
  };
}

export interface PlayClipOptions {
  loopOnce?: boolean;
  returnTo?: string | string[];
  timeScale?: number;
}

export interface RiggedActorHandle {
  group: THREE.Group;
  playClip: (names: string | string[], fadeSec?: number, opts?: PlayClipOptions) => void;
  attachToBone: (bonePatterns: string[], obj: THREE.Object3D) => boolean;
  tintKit: (primaryHex: string, secondaryHex?: string) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

const _boneWorldPos = new THREE.Vector3();
const _boneWorldQuat = new THREE.Quaternion();
const _invContainerQuat = new THREE.Quaternion();

function computeAccurateSkinnedSize(root: THREE.Group): { height: number; minY: number } {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);

  root.traverse((node) => {
    const sm = node as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) {
      sm.skeleton.pose();
      sm.skeleton.update();
      sm.computeBoundingBox();
    }
  });
  root.updateMatrixWorld(true);

  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  let sampled = 0;

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.attributes.position;
    if (!pos || pos.count === 0) return;

    const sm = node as THREE.SkinnedMesh;
    const stride = Math.max(1, Math.floor(pos.count / 180));
    for (let i = 0; i < pos.count; i += stride) {
      if (sm.isSkinnedMesh && sm.skeleton && typeof sm.getVertexPosition === 'function') {
        sm.getVertexPosition(i, v);
      } else {
        v.fromBufferAttribute(pos, i);
      }
      v.applyMatrix4(mesh.matrixWorld);
      if (Number.isFinite(v.y)) {
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
        sampled += 1;
      }
    }
  });

  if (sampled > 0 && Number.isFinite(minY) && Number.isFinite(maxY) && maxY - minY > 0.05) {
    return { height: maxY - minY, minY };
  }

  box.setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (Number.isFinite(size.y) && size.y > 0.35 && size.y < 300) {
    return { height: size.y, minY: box.min.y };
  }
  return { height: 1.82, minY: 0 };
}

function createProceduralAthleteFallback(
  targetHeight: number,
  primaryHex: string,
  secondaryHex: string
): THREE.Group {
  const g = new THREE.Group();
  const s = targetHeight / 1.85;
  const jerseyMat = new THREE.MeshStandardMaterial({
    color: primaryHex,
    roughness: 0.48,
    metalness: 0.1,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: secondaryHex,
    roughness: 0.32,
    metalness: 0.22,
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#e6b18a', roughness: 0.58 });
  const bootMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.42 });

  // Torso, Collar, Chest Stripe, Shorts, Legs, Boots, Arms, Head (9 parts bottom-centered)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19 * s, 0.38 * s, 6, 14), jerseyMat);
  torso.position.y = 1.12 * s;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.205 * s, 0.205 * s, 0.1 * s, 14), trimMat);
  stripe.position.y = 1.16 * s;
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.2 * s, 0.24 * s, 14), trimMat);
  shorts.position.y = 0.78 * s;

  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.072 * s, 0.48 * s, 4, 10), skinMat);
  legL.position.set(-0.1 * s, 0.38 * s, 0);
  const legR = legL.clone();
  legR.position.x = 0.1 * s;

  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.1 * s, 0.24 * s), bootMat);
  bootL.position.set(-0.1 * s, 0.06 * s, 0.04 * s);
  const bootR = bootL.clone();
  bootR.position.x = 0.1 * s;

  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.058 * s, 0.4 * s, 4, 10), jerseyMat);
  armL.position.set(-0.28 * s, 1.1 * s, 0);
  armL.rotation.z = 0.2;
  const armR = armL.clone();
  armR.position.x = 0.28 * s;
  armR.rotation.z = -0.2;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14 * s, 14, 14), skinMat);
  head.position.y = 1.62 * s;

  g.add(torso, stripe, shorts, legL, legR, bootL, bootR, armL, armR, head);
  return g;
}

export function spawnRigged3dActor(
  parent: THREE.Object3D,
  glbRelPath: string,
  opts: {
    position: [number, number, number];
    rotationY?: number;
    targetHeight?: number;
    defaultClips?: string[];
    castShadow?: boolean;
    primaryHex?: string;
    secondaryHex?: string;
  }
): RiggedActorHandle {
  const container = new THREE.Group();
  container.position.set(opts.position[0], opts.position[1], opts.position[2]);
  if (typeof opts.rotationY === 'number') {
    container.rotation.y = opts.rotationY;
  }
  parent.add(container);

  const desiredH = opts.targetHeight ?? 1.85;
  let proxyGroup: THREE.Group | null = createProceduralAthleteFallback(
    desiredH,
    opts.primaryHex || '#0ea5e9',
    opts.secondaryHex || '#0f172a'
  );
  container.add(proxyGroup);

  let disposed = false;
  let mixer: THREE.AnimationMixer | null = null;
  let clips: THREE.AnimationClip[] = [];
  let activeAction: THREE.AnimationAction | null = null;
  let pendingClips: string[] = opts.defaultClips || ['Idle', 'Wave', 'Dance'];
  let pendingReturnTo: string | string[] | null = null;
  let loadedModel: THREE.Group | null = null;
  const pendingAttachments: Array<{ patterns: string[]; obj: THREE.Object3D }> = [];
  const boneFollowers: Array<{ bone: THREE.Object3D; obj: THREE.Object3D }> = [];

  const resolveClip = (wanted: string[]): THREE.AnimationClip | undefined => {
    for (const n of wanted) {
      const exact = clips.find((c) => c.name.toLowerCase() === n.toLowerCase());
      if (exact) return exact;
    }
    for (const n of wanted) {
      const partial = clips.find((c) => c.name.toLowerCase().includes(n.toLowerCase()));
      if (partial) return partial;
    }
    return clips[0];
  };

  const playClip = (names: string | string[], fadeSec = 0.25, playOpts?: PlayClipOptions) => {
    const wanted = Array.isArray(names) ? names : [names];
    pendingClips = wanted;
    if (!mixer || clips.length === 0) return;
    const clip = resolveClip(wanted);
    if (!clip) return;
    const nextAction = mixer.clipAction(clip);
    if (activeAction === nextAction && !playOpts?.loopOnce) return;

    nextAction.reset();
    nextAction.timeScale = playOpts?.timeScale ?? 1;
    if (playOpts?.loopOnce) {
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.clampWhenFinished = true;
      pendingReturnTo = playOpts.returnTo || opts.defaultClips || ['Idle'];
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.clampWhenFinished = false;
      pendingReturnTo = null;
    }
    nextAction.fadeIn(fadeSec).play();
    if (activeAction && activeAction !== nextAction) {
      activeAction.crossFadeTo(nextAction, fadeSec, false);
    }
    activeAction = nextAction;
  };

  const attachToBone = (bonePatterns: string[], obj: THREE.Object3D): boolean => {
    if (!loadedModel) {
      if (!pendingAttachments.some((p) => p.obj === obj)) {
        pendingAttachments.push({ patterns: bonePatterns, obj });
      }
      if (obj.parent !== container) container.add(obj);
      return false;
    }
    let targetBone: THREE.Object3D | null = null;
    loadedModel.traverse((node) => {
      if (targetBone) return;
      const nm = (node.name || '').toLowerCase();
      if (bonePatterns.some((pat) => nm.includes(pat.toLowerCase()))) {
        targetBone = node;
      }
    });
    if (targetBone) {
      // Keep obj in 1:1 world meters inside container and follow the bone in update()
      // so Mixamo 0.01 Armature scales never shrink or distort hand-held gear.
      if (obj.parent !== container) container.add(obj);
      const existing = boneFollowers.find((f) => f.obj === obj);
      if (existing) existing.bone = targetBone;
      else boneFollowers.push({ bone: targetBone, obj });
      return true;
    }
    if (obj.parent !== container) container.add(obj);
    return false;
  };

  const tintKit = (primaryHex: string, secondaryHex?: string) => {
    if (!loadedModel) return;
    const pri = new THREE.Color(primaryHex);
    const sec = new THREE.Color(secondaryHex || primaryHex);
    let idx = 0;
    loadedModel.traverse((node) => {
      const m = node as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => {
        if (mat && 'color' in mat && mat.color instanceof THREE.Color) {
          const clone = mat.clone();
          (clone as THREE.MeshStandardMaterial).color.lerp(idx % 2 === 0 ? pri : sec, 0.55);
          m.material = clone;
          idx += 1;
        }
      });
    });
  };

  void loadCachedGltf(glbRelPath).then((gltf) => {
    if (!gltf?.scene || disposed) return;
    if (proxyGroup && proxyGroup.parent === container) {
      container.remove(proxyGroup);
      proxyGroup = null;
    }
    const cloned = cloneSkinned(gltf.scene) as THREE.Group;
    const measured = computeAccurateSkinnedSize(cloned);
    const saneHeight = measured.height >= 0.65 && measured.height <= 260 ? measured.height : desiredH;
    const rawScale = desiredH / saneHeight;
    const safeScale =
      saneHeight < 3.2
        ? Math.max(0.55, Math.min(1.35, rawScale))
        : Math.max(0.004, Math.min(1.35, rawScale));
    cloned.scale.setScalar(safeScale);
    cloned.position.y = -measured.minY * safeScale;
    cloned.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        (node as THREE.Mesh).castShadow = Boolean(opts.castShadow);
        (node as THREE.Mesh).receiveShadow = true;
      }
    });
    container.add(cloned);
    cloned.updateMatrixWorld(true);
    loadedModel = cloned;

    if (opts.primaryHex) {
      tintKit(opts.primaryHex, opts.secondaryHex);
    }
    applyFresnelRimToGroup(cloned, {
      colorHex: opts.primaryHex || '#38bdf8',
      power: 3.2,
      intensity: 0.42,
    });

    if (pendingAttachments.length > 0) {
      const queue = pendingAttachments.splice(0, pendingAttachments.length);
      queue.forEach((item) => attachToBone(item.patterns, item.obj));
    }

    clips = gltf.animations || [];
    if (clips.length > 0) {
      mixer = new THREE.AnimationMixer(cloned);
      mixer.addEventListener('finished', () => {
        if (pendingReturnTo && !disposed) {
          const next = pendingReturnTo;
          pendingReturnTo = null;
          playClip(next, 0.25);
        }
      });
      playClip(pendingClips, 0.22);
    }
  });

  return {
    group: container,
    playClip,
    attachToBone,
    tintKit,
    update: (dt: number) => {
      if (mixer && !disposed) {
        mixer.update(dt);
      }
      if (loadedModel && boneFollowers.length > 0 && !disposed) {
        container.updateMatrixWorld(true);
        container.getWorldQuaternion(_invContainerQuat).invert();
        for (let i = 0; i < boneFollowers.length; i += 1) {
          const { bone, obj } = boneFollowers[i];
          bone.getWorldPosition(_boneWorldPos);
          container.worldToLocal(_boneWorldPos);
          obj.position.copy(_boneWorldPos);
          bone.getWorldQuaternion(_boneWorldQuat);
          obj.quaternion.copy(_invContainerQuat).multiply(_boneWorldQuat);
        }
      }
    },
    dispose: () => {
      disposed = true;
      boneFollowers.length = 0;
      if (mixer) {
        mixer.stopAllAction();
        mixer = null;
      }
      if (container.parent) {
        container.parent.remove(container);
      }
    },
  };
}

// ===================================================================
// PROCEDURAL PBR SPORTS TEXTURES & COMPOSITE 3-12 PART GEOMETRIES
// ===================================================================

export function createFootballTexture(anisotropy = 4): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 512, 256);

  // Subtle stitched seam hexagons
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  const stepX = 64;
  const stepY = 56;
  for (let row = -1; row < 6; row += 1) {
    for (let col = -1; col < 10; col += 1) {
      const cx = col * stepX + (row % 2 === 0 ? stepX * 0.5 : 0);
      const cy = row * stepY;
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const r = 18;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if ((row + col) % 2 === 0) {
        ctx.fillStyle = '#0f172a';
        ctx.fill();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createMowedPitchTexture(anisotropy = 4): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const bands = 10;
  const bandH = c.height / bands;
  for (let i = 0; i < bands; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#157438' : '#1b8542';
    ctx.fillRect(0, i * bandH, c.width, bandH);
  }
  // Micro-turf grain noise
  for (let i = 0; i < 3600; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createBowlingPinGroup(): THREE.Group {
  const group = new THREE.Group();
  // Classic USBC lathe silhouette (15 inches ~ 0.38m scaled to arena coords 1.05 units tall)
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.095, 0.0),
    new THREE.Vector2(0.14, 0.14),
    new THREE.Vector2(0.165, 0.34),
    new THREE.Vector2(0.13, 0.56),
    new THREE.Vector2(0.068, 0.74),
    new THREE.Vector2(0.066, 0.84),
    new THREE.Vector2(0.094, 0.94),
    new THREE.Vector2(0.088, 1.03),
    new THREE.Vector2(0.045, 1.08),
    new THREE.Vector2(0.0, 1.09),
  ];
  const bodyGeo = new THREE.LatheGeometry(pts, 20);
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: '#f8fafc',
    roughness: 0.22,
    metalness: 0.04,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;

  // Dual red championship neck stripes
  const stripeMat = new THREE.MeshStandardMaterial({
    color: '#dc2626',
    roughness: 0.32,
    metalness: 0.1,
  });
  const stripe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.036, 18), stripeMat);
  stripe1.position.y = 0.77;
  const stripe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.028, 18), stripeMat);
  stripe2.position.y = 0.83;

  // Base bumper ring
  const baseMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.7 });
  const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.025, 18), baseMat);
  baseRing.position.y = 0.012;

  group.add(body, stripe1, stripe2, baseRing);
  return group;
}

export function createCompositeRacketGroup(accentHex: string): THREE.Group {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.26,
    metalness: 0.75,
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.82,
    metalness: 0.05,
  });
  const stringMat = new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    roughness: 0.4,
    metalness: 0.1,
    wireframe: true,
    transparent: true,
    opacity: 0.68,
  });

  // 1. Head Hoop
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.028, 10, 28), frameMat);
  hoop.scale.set(0.84, 1.15, 1);
  hoop.position.y = 0.72;

  // 2. String Bed
  const bed = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), stringMat);
  bed.scale.set(0.82, 1.12, 1);
  bed.position.y = 0.72;

  // 3-4. V-Throat struts
  const strutL = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.3, 8), frameMat);
  strutL.position.set(-0.075, 0.34, 0);
  strutL.rotation.z = -0.35;
  const strutR = strutL.clone();
  strutR.position.x = 0.075;
  strutR.rotation.z = 0.35;

  // 5. Handle Grip + 6. Butt Cap
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.32, 10), gripMat);
  grip.position.y = 0.14;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 10), frameMat);
  cap.position.y = -0.02;

  g.add(hoop, bed, strutL, strutR, grip, cap);
  return g;
}

export interface Particle3DBurstHandle {
  emit: (x: number, y: number, z: number, colorHex: number, count?: number, spread?: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

const _pDummy = new THREE.Object3D();
const _pCol = new THREE.Color();

export function create3dParticleBurstSystem(
  parent: THREE.Object3D,
  maxCount = 96
): Particle3DBurstHandle {
  const geo = new THREE.OctahedronGeometry(0.11, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, maxCount);
  mesh.frustumCulled = false;
  parent.add(mesh);

  const slots = Array.from({ length: maxCount }, () => ({
    active: false,
    x: 0,
    y: -99,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    maxLife: 0.7,
    scale: 1,
    rot: 0,
  }));
  let cursor = 0;

  for (let i = 0; i < maxCount; i += 1) {
    _pDummy.position.set(0, -99, 0);
    _pDummy.scale.setScalar(0.001);
    _pDummy.updateMatrix();
    mesh.setMatrixAt(i, _pDummy.matrix);
    mesh.setColorAt(i, _pCol.setHex(0xfacc15));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return {
    emit: (x, y, z, colorHex, count = 20, spread = 4.5) => {
      _pCol.setHex(colorHex);
      for (let i = 0; i < count; i += 1) {
        const s = slots[cursor];
        cursor = (cursor + 1) % maxCount;
        s.active = true;
        s.x = x;
        s.y = y;
        s.z = z;
        const a = Math.random() * Math.PI * 2;
        const spd = (0.35 + Math.random() * 0.85) * spread;
        s.vx = Math.cos(a) * spd;
        s.vy = 2.2 + Math.random() * spread;
        s.vz = Math.sin(a) * spd;
        s.life = 0;
        s.maxLife = 0.55 + Math.random() * 0.45;
        s.scale = 0.65 + Math.random() * 0.9;
        s.rot = Math.random() * Math.PI;
        mesh.setColorAt(cursor === 0 ? maxCount - 1 : cursor - 1, _pCol);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    update: (dt) => {
      let any = false;
      for (let i = 0; i < maxCount; i += 1) {
        const s = slots[i];
        if (!s.active) continue;
        any = true;
        s.life += dt;
        if (s.life >= s.maxLife) {
          s.active = false;
          _pDummy.position.set(0, -99, 0);
          _pDummy.scale.setScalar(0.001);
          _pDummy.updateMatrix();
          mesh.setMatrixAt(i, _pDummy.matrix);
          continue;
        }
        s.vy -= 11.5 * dt;
        s.x += s.vx * dt;
        s.y = Math.max(0.04, s.y + s.vy * dt);
        s.z += s.vz * dt;
        s.rot += dt * 7;
        const t = 1 - s.life / s.maxLife;
        _pDummy.position.set(s.x, s.y, s.z);
        _pDummy.rotation.set(s.rot, s.rot * 0.7, 0);
        _pDummy.scale.setScalar(Math.max(0.01, s.scale * t));
        _pDummy.updateMatrix();
        mesh.setMatrixAt(i, _pDummy.matrix);
      }
      if (any) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      if (mesh.parent) mesh.parent.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}

export function createWovenNetTexture(anisotropy = 4): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.82)';
  ctx.lineWidth = 3;
  const step = 16;
  for (let i = 0; i <= 128; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createStadiumStandsGroup(options?: {
  width?: number;
  tiers?: number;
  depth?: number;
  accentHex?: number;
}): {
  group: THREE.Group;
  updateCrowd: (elapsed: number, excitement?: number) => void;
  dispose: () => void;
} {
  const width = options?.width ?? 44;
  const tiers = options?.tiers ?? 5;
  const depth = options?.depth ?? 9;
  const accentHex = options?.accentHex ?? 0x38bdf8;
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.88, metalness: 0.08 });
  const fasciaMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.45,
    roughness: 0.4,
  });
  mats.push(concreteMat, fasciaMat);

  const tierDepth = depth / tiers;
  for (let t = 0; t < tiers; t += 1) {
    const h = 1.15 + t * 0.95;
    const stepGeo = new THREE.BoxGeometry(width, h, tierDepth + 0.15);
    geos.push(stepGeo);
    const step = new THREE.Mesh(stepGeo, concreteMat);
    step.position.set(0, h * 0.5, -t * tierDepth);
    group.add(step);
  }

  const fasciaGeo = new THREE.BoxGeometry(width, 0.22, 0.2);
  geos.push(fasciaGeo);
  const fascia = new THREE.Mesh(fasciaGeo, fasciaMat);
  fascia.position.set(0, 1.05, tierDepth * 0.5 + 0.05);
  group.add(fascia);

  // Instanced cheering spectators across tiers
  const cols = Math.floor(width / 1.35);
  const totalCrowd = cols * tiers;
  const fanGeo = new THREE.CapsuleGeometry(0.18, 0.34, 4, 6);
  geos.push(fanGeo);
  const fanMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 });
  mats.push(fanMat);
  const crowdInst = new THREE.InstancedMesh(fanGeo, fanMat, totalCrowd);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const palette = [0x38bdf8, 0xfacc15, 0xf43f5e, 0xa855f7, 0x22c55e, 0xf8fafc, 0xfb923c];
  const basePos: Array<{ x: number; y: number; z: number; phase: number }> = [];

  let idx = 0;
  for (let t = 0; t < tiers; t += 1) {
    const ty = 1.15 + t * 0.95 + 0.32;
    const tz = -t * tierDepth;
    for (let c = 0; c < cols; c += 1) {
      const fx = -width * 0.48 + (c + 0.5) * ((width * 0.96) / cols);
      const jitterZ = ((c * 17 + t * 11) % 5 - 2) * 0.08;
      basePos.push({ x: fx, y: ty, z: tz + jitterZ, phase: c * 0.55 + t * 1.1 });
      dummy.position.set(fx, ty, tz + jitterZ);
      dummy.scale.setScalar(0.88 + ((c + t) % 4) * 0.08);
      dummy.updateMatrix();
      crowdInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(palette[(c * 3 + t * 5) % palette.length]);
      crowdInst.setColorAt(idx, col);
      idx += 1;
    }
  }
  crowdInst.instanceMatrix.needsUpdate = true;
  if (crowdInst.instanceColor) crowdInst.instanceColor.needsUpdate = true;
  crowdInst.computeBoundingSphere();
  group.add(crowdInst);

  return {
    group,
    updateCrowd: (elapsed: number, excitement = 0.25) => {
      const amp = 0.04 + excitement * 0.16;
      const spd = 2.6 + excitement * 6.5;
      for (let i = 0; i < basePos.length; i += 1) {
        const bp = basePos[i];
        const hop = Math.max(0, Math.sin(elapsed * spd + bp.phase)) * amp;
        dummy.position.set(bp.x, bp.y + hop, bp.z);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        crowdInst.setMatrixAt(i, dummy.matrix);
      }
      crowdInst.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

export function applyResponsiveCameraFov(
  camera: THREE.PerspectiveCamera,
  aspect: number,
  baseFov = 46,
  minFov = 44,
  maxFov = 70
): void {
  if (!Number.isFinite(aspect) || aspect <= 0) return;
  if (aspect < 1.35) {
    const scaled = baseFov / Math.max(0.58, aspect / 1.48);
    camera.fov = Math.max(minFov, Math.min(maxFov, scaled));
  } else {
    camera.fov = Math.max(minFov, Math.min(maxFov, baseFov));
  }
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

export function createSkyDomeTexture(options?: {
  topHex?: string;
  midHex?: string;
  horizonHex?: string;
  sunGlowHex?: string;
  stars?: boolean;
}): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, options?.topHex || '#0f274c');
  grad.addColorStop(0.52, options?.midHex || '#285a8f');
  grad.addColorStop(1, options?.horizonHex || '#8bc3e8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  if (options?.stars) {
    for (let i = 0; i < 160; i += 1) {
      const sx = ((i * 197) % 503) + 4;
      const sy = ((i * 89) % 132) + 4;
      const r = i % 5 === 0 ? 1.5 : 0.9;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(186,230,253,0.55)';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (options?.sunGlowHex) {
    const glow = ctx.createRadialGradient(c.width * 0.72, c.height * 0.44, 6, c.width * 0.72, c.height * 0.44, 150);
    glow.addColorStop(0, options.sunGlowHex);
    glow.addColorStop(0.45, 'rgba(255, 224, 160, 0.22)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, c.width, c.height);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
}

export function createMarbledBallTexture(
  baseHex = '#0284c7',
  swirlHex = '#e0f2fe',
  accentHex = '#0c4a6e'
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, accentHex);
  grad.addColorStop(0.5, baseHex);
  grad.addColorStop(1, accentHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  for (let i = 0; i < 16; i += 1) {
    ctx.strokeStyle = i % 2 === 0 ? swirlHex : 'rgba(255,255,255,0.28)';
    ctx.globalAlpha = 0.22 + (i % 4) * 0.08;
    ctx.lineWidth = 4 + (i % 5) * 2;
    ctx.beginPath();
    const y0 = (i / 16) * c.height;
    ctx.moveTo(0, y0);
    ctx.bezierCurveTo(
      c.width * 0.3,
      y0 + Math.sin(i * 1.4) * 28,
      c.width * 0.7,
      y0 - Math.cos(i * 1.1) * 28,
      c.width,
      y0
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Finger grip holes
  ctx.fillStyle = '#070b14';
  [
    [122, 46, 7],
    [140, 46, 7],
    [131, 68, 8.5],
  ].forEach(([hx, hy, hr]) => {
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createWoodPlankTexture(
  baseHex = '#a97442',
  altHex = '#925f31',
  anisotropy = 4
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const planks = 8;
  const pw = c.width / planks;
  for (let i = 0; i < planks; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? baseHex : altHex;
    ctx.fillRect(i * pw, 0, pw, c.height);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(i * pw, 0, 1.5, c.height);
    ctx.strokeStyle = 'rgba(60,30,10,0.16)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 10; g += 1) {
      const gx = i * pw + ((g * 19 + i * 7) % Math.max(6, Math.floor(pw - 4))) + 2;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(gx + 3, c.height * 0.33, gx - 3, c.height * 0.66, gx, c.height);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

