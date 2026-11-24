import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveGameAssetUrl } from '../../../shared/gameAssetsCdn';
import {
  applyFresnelRimShader,
  applyFresnelRimToGroup,
  attachSafeMeshDecoders,
} from '../arcade/threePostFxHelpers';

export interface RealWheelSpinNode {
  obj: THREE.Object3D;
  baseRotX: number;
  baseRotZ: number;
}

export interface BuiltCarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  frontWheelPivots: [THREE.Group, THREE.Group];
  wheelSpinGroups: THREE.Group[];
  realWheelSpins: RealWheelSpinNode[];
  realFrontSteerNodes: Array<{ obj: THREE.Object3D; baseRotZ: number }>;
  brakeLightMaterial: THREE.MeshStandardMaterial;
  nitroFlames: [THREE.Mesh, THREE.Mesh];
  dispose: () => void;
}

const GLB_CACHE = new Map<string, Promise<THREE.Group | null>>();
const AO_TEX_CACHE = new Map<string, Promise<THREE.Texture | null>>();
const sharedGltfLoader = new GLTFLoader();
sharedGltfLoader.setCrossOrigin('anonymous');
attachSafeMeshDecoders(sharedGltfLoader);
const sharedAoTexLoader = new THREE.TextureLoader();
sharedAoTexLoader.setCrossOrigin('anonymous');

function loadCachedRaceModel(relUrl: string): Promise<THREE.Group | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return Promise.resolve(null);
  const resolvedUrl = resolveGameAssetUrl(relUrl);
  const existing = GLB_CACHE.get(resolvedUrl);
  if (existing) return existing;
  const p = new Promise<THREE.Group | null>((resolve) => {
    sharedGltfLoader.load(
      resolvedUrl,
      (gltf) => {
        const scene = gltf?.scene;
        if (!scene) {
          resolve(null);
          return;
        }
        resolve(scene);
      },
      undefined,
      () => resolve(null)
    );
  });
  GLB_CACHE.set(resolvedUrl, p);
  return p;
}

function loadCachedAoShadow(relUrl: string): Promise<THREE.Texture | null> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return Promise.resolve(null);
  const resolvedUrl = resolveGameAssetUrl(relUrl);
  const existing = AO_TEX_CACHE.get(resolvedUrl);
  if (existing) return existing;
  const p = new Promise<THREE.Texture | null>((resolve) => {
    sharedAoTexLoader.load(
      resolvedUrl,
      (tex) => resolve(tex || null),
      undefined,
      () => resolve(null)
    );
  });
  AO_TEX_CACHE.set(resolvedUrl, p);
  return p;
}

export function buildFormulaGtCar(
  primaryHex: number,
  accentHex: number,
  options?: { castShadow?: boolean; isPlayer?: boolean; rivalIndex?: number }
): BuiltCarRig {
  const castShadow = Boolean(options?.castShadow);
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const proceduralBody = new THREE.Group();
  bodyGroup.add(proceduralBody);
  root.add(bodyGroup);
  let disposed = false;
  let glbClone: THREE.Group | null = null;

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const realWheelSpins: RealWheelSpinNode[] = [];
  const realFrontSteerNodes: Array<{ obj: THREE.Object3D; baseRotZ: number }> = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const paintMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: primaryHex,
      metalness: 0.42,
      roughness: 0.24,
      clearcoat: 0.72,
      clearcoatRoughness: 0.14,
    })
  );
  applyFresnelRimShader(paintMat, {
    colorHex: accentHex,
    power: 3.4,
    intensity: options?.isPlayer ? 0.22 : 0.16,
  });

  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: options?.isPlayer ? 0.22 : 0.12,
      metalness: 0.35,
      roughness: 0.35,
    })
  );

  const carbonMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x11141c,
      metalness: 0.55,
      roughness: 0.42,
    })
  );

  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x060b16,
      metalness: 0.2,
      roughness: 0.06,
      clearcoat: 1.0,
    })
  );

  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x16181f,
      metalness: 0.08,
      roughness: 0.85,
    })
  );

  const rimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd4d8e2,
      metalness: 0.88,
      roughness: 0.22,
    })
  );

  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xd8f3ff,
      emissiveIntensity: 2.0,
      roughness: 0.1,
    })
  );

  const brakeLightMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff2244,
      emissive: 0xff1133,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    })
  );

  // Sleek fallback chassis shown only during async GLB decode (<400ms)
  const floorMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.92, 0.14, 4.35)), carbonMat);
  floorMesh.position.set(0, 0.28, 0);
  floorMesh.castShadow = castShadow;
  proceduralBody.add(floorMesh);

  const chassisMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.74, 0.42, 3.65)), paintMat);
  chassisMesh.position.set(0, 0.54, 0.08);
  chassisMesh.castShadow = castShadow;
  proceduralBody.add(chassisMesh);

  const noseMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.04, 0.26, 1.15)), paintMat);
  noseMesh.position.set(0, 0.46, -1.92);
  noseMesh.rotation.x = 0.08;
  noseMesh.castShadow = castShadow;
  proceduralBody.add(noseMesh);

  const stripeMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.44, 3.72)), accentMat);
  stripeMesh.position.set(0, 0.56, 0.02);
  proceduralBody.add(stripeMesh);

  const cockpitMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.06, 0.38, 1.55)), glassMat);
  cockpitMesh.position.set(0, 0.88, 0.16);
  cockpitMesh.castShadow = castShadow;
  proceduralBody.add(cockpitMesh);

  const rearWing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 0.08, 0.44)), carbonMat);
  rearWing.position.set(0, 1.12, 1.78);
  rearWing.rotation.x = -0.14;
  rearWing.castShadow = castShadow;
  proceduralBody.add(rearWing);

  const headGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.09, 0.1));
  [-0.58, 0.58].forEach((x) => {
    const hl = new THREE.Mesh(headGeo, headlightMat);
    hl.position.set(x, 0.5, -1.78);
    proceduralBody.add(hl);
  });

  const tailGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.1, 0.08));
  [-0.56, 0.56].forEach((x) => {
    const tl = new THREE.Mesh(tailGeo, brakeLightMaterial);
    tl.position.set(x, 0.58, 1.92);
    proceduralBody.add(tl);
  });

  const flameGeo = trackGeo(new THREE.ConeGeometry(0.16, 0.85, 10));
  flameGeo.rotateX(Math.PI / 2);
  const flameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const flameL = new THREE.Mesh(flameGeo, flameMat);
  flameL.position.set(-0.26, 0.4, 2.28);
  flameL.visible = false;
  const flameR = new THREE.Mesh(flameGeo, flameMat);
  flameR.position.set(0.26, 0.4, 2.28);
  flameR.visible = false;
  bodyGroup.add(flameL, flameR);

  const tireGeo = trackGeo(new THREE.CylinderGeometry(0.38, 0.38, 0.32, 18));
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.34, 12));
  rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = trackGeo(new THREE.BoxGeometry(0.35, 0.07, 0.42));

  const wheelSpinGroups: THREE.Group[] = [];
  const createWheel = (x: number, z: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.38, z);

    const spin = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = castShadow;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    const spokeA = new THREE.Mesh(spokeGeo, accentMat);
    const spokeB = new THREE.Mesh(spokeGeo, accentMat);
    spokeB.rotation.x = Math.PI / 2;

    spin.add(tire, rim, spokeA, spokeB);
    pivot.add(spin);
    root.add(pivot);
    wheelSpinGroups.push(spin);
    return pivot;
  };

  const frontLeftPivot = createWheel(-0.98, -1.42);
  const frontRightPivot = createWheel(0.98, -1.42);
  const rearLeftPivot = createWheel(-1.02, 1.38);
  const rearRightPivot = createWheel(1.02, 1.38);

  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    })
  );
  const shadowPlane = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(2.65, 5.2)), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.028;
  root.add(shadowPlane);

  const underglowMesh = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(1.75, 3.6)),
    trackMat(
      new THREE.MeshBasicMaterial({
        color: accentHex,
        transparent: true,
        opacity: options?.isPlayer ? 0.24 : 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );
  underglowMesh.rotation.x = -Math.PI / 2;
  underglowMesh.position.y = 0.036;
  root.add(underglowMesh);

  // Real online 3D Motorsport Models:
  // - ferrari.glb natively faces -Z forward (yawOffset = 0)
  // - endurance.glb / hypercar.glb / rally.glb natively face +Z forward (yawOffset = Math.PI)
  const rivalPool: Array<{ path: string; yawOffset: number }> = [
    { path: 'assets/games/models/endurance.glb', yawOffset: Math.PI },
    { path: 'assets/games/models/hypercar.glb', yawOffset: Math.PI },
    { path: 'assets/games/models/rally.glb', yawOffset: Math.PI },
  ];
  const selected = options?.isPlayer
    ? { path: 'assets/games/models/ferrari.glb', yawOffset: 0 }
    : rivalPool[((options?.rivalIndex ?? 1) - 1 + rivalPool.length) % rivalPool.length];

  if (options?.isPlayer) {
    void loadCachedAoShadow('assets/games/models/ferrari_ao.png').then((aoTex) => {
      if (!aoTex || disposed) return;
      shadowMat.map = aoTex;
      shadowMat.color.setHex(0xffffff);
      shadowMat.opacity = 0.92;
      shadowMat.needsUpdate = true;
    });
  }

  void loadCachedRaceModel(selected.path).then((source) => {
    if (!source || disposed) return;
    const clone = source.clone(true);
    clone.rotation.y = selected.yawOffset;
    clone.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const scale = 4.5 / Math.max(0.5, size.z);
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -box.min.y * scale + 0.02, -center.z * scale);

    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = castShadow;
        mesh.receiveShadow = castShadow;
        const matName = String((mesh.material as THREE.Material | undefined)?.name || '');
        if (options?.isPlayer && (mesh.name === 'body' || /^Paint_/i.test(matName))) {
          mesh.material = paintMat;
        } else if (!options?.isPlayer && /^Paint_/i.test(matName)) {
          mesh.material = paintMat;
        }
      }
      if (/^wheel_(fl|fr|rl|rr)$/i.test(node.name)) {
        realWheelSpins.push({
          obj: node,
          baseRotX: node.rotation.x,
          baseRotZ: node.rotation.z,
        });
        if (/^wheel_f[lr]$/i.test(node.name)) {
          realFrontSteerNodes.push({ obj: node, baseRotZ: node.rotation.z });
        }
      }
    });

    if (selected.yawOffset === 0) {
      applyFresnelRimToGroup(clone, {
        colorHex: accentHex,
        power: 3.4,
        intensity: 0.16,
      });
    }

    const glbBrakeBar = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.22, 0.075, 0.07)),
      brakeLightMaterial
    );
    glbBrakeBar.position.set(0, 0.68, 2.15);

    glbClone = clone;
    bodyGroup.add(clone, glbBrakeBar);
    proceduralBody.visible = false;
    frontLeftPivot.visible = false;
    frontRightPivot.visible = false;
    rearLeftPivot.visible = false;
    rearRightPivot.visible = false;
  });

  return {
    root,
    bodyGroup,
    frontWheelPivots: [frontLeftPivot, frontRightPivot],
    wheelSpinGroups,
    realWheelSpins,
    realFrontSteerNodes,
    brakeLightMaterial,
    nitroFlames: [flameL, flameR],
    dispose: () => {
      disposed = true;
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      if (glbClone && glbClone.parent) {
        glbClone.parent.remove(glbClone);
      }
      glbClone = null;
    },
  };
}
