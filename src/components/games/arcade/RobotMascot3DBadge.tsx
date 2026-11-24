import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { resolveGameAssetUrl } from '../../../shared/gameAssetsCdn';
import {
  createResilientWebGlRenderer,
  createThreeFramePacer,
  detectSoftwareGl,
  initRoomEnvironment,
  loadCachedGltf,
} from './threeProHelpers';

export type RobotAnimationClip =
  | 'Dance'
  | 'Wave'
  | 'ThumbsUp'
  | 'Jump'
  | 'Running'
  | 'Idle'
  | 'Walk'
  | 'Run';

export type RiggedMascotCharacter = 'robot' | 'xbot' | 'soldier' | 'michelle';

const MASCOT_MODEL_PATHS: Record<RiggedMascotCharacter, string> = {
  robot: 'assets/games/models/RobotExpressive.glb',
  xbot: 'assets/games/models/Xbot.glb',
  soldier: 'assets/games/models/Soldier.glb',
  michelle: 'assets/games/models/Michelle.glb',
};

interface RobotMascot3DBadgeProps {
  clip?: RobotAnimationClip;
  character?: RiggedMascotCharacter;
  className?: string;
  label?: string;
}

export const RobotMascot3DBadge: React.FC<RobotMascot3DBadgeProps> = ({
  clip = 'Dance',
  character = 'robot',
  className = 'w-28 h-28',
  label = 'Mascota 3D animada',
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [fallbackActive, setFallbackActive] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof window === 'undefined') {
      setFallbackActive(true);
      return;
    }

    const isSoftwareGl = detectSoftwareGl();
    const renderer = createResilientWebGlRenderer(isSoftwareGl, { alpha: true, exposure: 1.15 });
    if (!renderer) {
      setFallbackActive(true);
      return;
    }

    const w = Math.max(88, host.clientWidth || 112);
    const h = Math.max(88, host.clientHeight || 112);
    renderer.setSize(w, h);
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setFallbackActive(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    const roomEnv = initRoomEnvironment(scene, renderer);

    const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 40);
    camera.position.set(0, 1.85, 5.2);
    camera.lookAt(0, 1.05, 0);

    const hemi = new THREE.HemisphereLight('#e0f2fe', '#1e1b4b', 1.25);
    const key = new THREE.DirectionalLight('#fff7ed', 2.2);
    key.position.set(3, 6, 4);
    const rim = new THREE.DirectionalLight('#38bdf8', 1.5);
    rim.position.set(-4, 3, -4);
    scene.add(hemi, key, rim);

    // Grounded contact shadow disc
    const shadowGeo = new THREE.CircleGeometry(0.95, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x020617,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.01;
    scene.add(shadowDisc);

    let mixer: THREE.AnimationMixer | null = null;
    let modelRoot: THREE.Object3D | null = null;
    let alive = true;
    const clock = new THREE.Clock();
    const pacer = createThreeFramePacer(renderer, isSoftwareGl);

    const glbPath = MASCOT_MODEL_PATHS[character] || MASCOT_MODEL_PATHS.robot;

    void loadCachedGltf(glbPath).then((gltf) => {
      if (!alive) return;
      if (!gltf?.scene) {
        setFallbackActive(true);
        return;
      }
      const cloned = cloneSkinned(gltf.scene) as THREE.Group;
      cloned.position.set(0, 0, 0);
      cloned.rotation.set(0, 0, 0);
      cloned.scale.setScalar(1);
      cloned.updateMatrixWorld(true);
      cloned.traverse((node) => {
        const sm = node as THREE.SkinnedMesh;
        if (sm.isSkinnedMesh && sm.skeleton) {
          sm.skeleton.pose();
          sm.skeleton.update();
          sm.computeBoundingBox();
        }
      });
      cloned.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(cloned);
      const size = new THREE.Vector3();
      box.getSize(size);
      const measuredH = Number.isFinite(size.y) && size.y > 0.45 && size.y < 220 ? size.y : 1.85;
      const scale = Math.max(0.01, Math.min(2.2, 2.05 / measuredH));
      cloned.scale.setScalar(scale);
      cloned.position.y = -box.min.y * scale;
      if (character === 'soldier') {
        cloned.rotation.y = Math.PI;
      }
      modelRoot = cloned;
      scene.add(modelRoot);
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(modelRoot);
        const wanted =
          gltf.animations.find((a) => a.name.toLowerCase() === clip.toLowerCase()) ||
          gltf.animations.find((a) => a.name.toLowerCase().includes(clip.toLowerCase())) ||
          gltf.animations.find((a) => /dance|run|wave|walk/i.test(a.name)) ||
          gltf.animations[0];
        const action = mixer.clipAction(wanted);
        action.reset().fadeIn(0.3).play();
      }
    });

    const tick = () => {
      if (!alive) return;
      const dt = Math.min(0.05, clock.getDelta());
      if (mixer) mixer.update(dt);
      if (modelRoot) {
        const baseYaw = character === 'soldier' ? Math.PI : 0;
        modelRoot.rotation.y = baseYaw + Math.sin(clock.elapsedTime * 0.9) * 0.42;
      }
      renderer.render(scene, camera);
      pacer.schedule(tick);
    };
    const startRaf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(startRaf);
      pacer.cancel();
      shadowGeo.dispose();
      shadowMat.dispose();
      roomEnv.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.dispose();
      host.innerHTML = '';
    };
  }, [character, clip]);

  if (fallbackActive) {
    return (
      <div className={`relative flex items-center justify-center ${className}`} aria-label={label}>
        <img
          src={resolveGameAssetUrl('assets/games/toon/robot_cheer0.png')}
          crossOrigin="anonymous"
          alt={label}
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain drop-shadow-[0_6px_16px_rgba(56,189,248,0.4)]"
        />
      </div>
    );
  }

  return <div ref={hostRef} className={`relative overflow-hidden ${className}`} aria-label={label} />;
};
