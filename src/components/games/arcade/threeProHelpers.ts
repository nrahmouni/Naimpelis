import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { resolveGameAssetUrl } from '../../../shared/gameAssetsCdn';

const GLTF_CACHE = new Map<string, Promise<GLTF | null>>();
const TEXTURE_CACHE = new Map<string, Promise<THREE.Texture | null>>();
const sharedGltfLoader = new GLTFLoader();
sharedGltfLoader.setCrossOrigin('anonymous');
const sharedTextureLoader = new THREE.TextureLoader();
sharedTextureLoader.setCrossOrigin('anonymous');

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

export interface RiggedActorHandle {
  group: THREE.Group;
  playClip: (names: string | string[], fadeSec?: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
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
  }
): RiggedActorHandle {
  const container = new THREE.Group();
  container.position.set(opts.position[0], opts.position[1], opts.position[2]);
  if (typeof opts.rotationY === 'number') {
    container.rotation.y = opts.rotationY;
  }
  parent.add(container);

  let disposed = false;
  let mixer: THREE.AnimationMixer | null = null;
  let clips: THREE.AnimationClip[] = [];
  let activeAction: THREE.AnimationAction | null = null;
  let pendingClips: string[] = opts.defaultClips || ['Wave', 'Dance', 'Idle'];

  const playClip = (names: string | string[], fadeSec = 0.28) => {
    const wanted = Array.isArray(names) ? names : [names];
    pendingClips = wanted;
    if (!mixer || clips.length === 0) return;
    let clip: THREE.AnimationClip | undefined;
    for (const n of wanted) {
      clip = clips.find((c) => c.name.toLowerCase() === n.toLowerCase());
      if (clip) break;
    }
    if (!clip) {
      for (const n of wanted) {
        clip = clips.find((c) => c.name.toLowerCase().includes(n.toLowerCase()));
        if (clip) break;
      }
    }
    if (!clip) clip = clips[0];
    if (!clip) return;
    const nextAction = mixer.clipAction(clip);
    if (activeAction === nextAction) return;
    nextAction.reset().fadeIn(fadeSec).play();
    if (activeAction) {
      activeAction.crossFadeTo(nextAction, fadeSec, false);
    }
    activeAction = nextAction;
  };

  void loadCachedGltf(glbRelPath).then((gltf) => {
    if (!gltf?.scene || disposed) return;
    const cloned = cloneSkinned(gltf.scene) as THREE.Group;
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const desiredH = opts.targetHeight ?? 2.2;
    const scale = desiredH / Math.max(0.25, size.y);
    cloned.scale.setScalar(scale);
    cloned.position.y = -box.min.y * scale;
    cloned.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        (node as THREE.Mesh).castShadow = Boolean(opts.castShadow);
        (node as THREE.Mesh).receiveShadow = true;
      }
    });
    container.add(cloned);
    clips = gltf.animations || [];
    if (clips.length > 0) {
      mixer = new THREE.AnimationMixer(cloned);
      playClip(pendingClips, 0.25);
    }
  });

  return {
    group: container,
    playClip,
    update: (dt: number) => {
      if (mixer && !disposed) {
        mixer.update(dt);
      }
    },
    dispose: () => {
      disposed = true;
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
