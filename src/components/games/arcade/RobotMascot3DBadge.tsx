import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { resolveGameAssetUrl } from '../../../shared/gameAssetsCdn';
import { loadCachedGltf } from './threeProHelpers';

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

    let renderer: THREE.WebGLRenderer | null = null;
    let isSoftwareGl = false;
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
      if (!gl) {
        setFallbackActive(true);
        return;
      }
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !isSoftwareGl,
        powerPreference: 'low-power',
      });
    } catch {
      setFallbackActive(true);
      return;
    }

    const w = Math.max(88, host.clientWidth || 112);
    const h = Math.max(88, host.clientHeight || 112);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setFallbackActive(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    let envRt: THREE.WebGLRenderTarget | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new RoomEnvironment();
      envRt = pmrem.fromScene(envScene, 0.04);
      scene.environment = envRt.texture;
      envScene.dispose();
      pmrem.dispose();
    } catch {
      envRt?.dispose();
      envRt = null;
    }

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
    let rafId = 0;
    let timeoutId = 0;
    const clock = new THREE.Clock();

    const glbPath = MASCOT_MODEL_PATHS[character] || MASCOT_MODEL_PATHS.robot;

    void loadCachedGltf(glbPath).then((gltf) => {
      if (!alive) return;
      if (!gltf?.scene) {
        setFallbackActive(true);
        return;
      }
      modelRoot = cloneSkinned(gltf.scene);
      const box = new THREE.Box3().setFromObject(modelRoot);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = 2.05 / Math.max(0.25, size.y);
      modelRoot.scale.setScalar(scale);
      modelRoot.position.y = -box.min.y * scale;
      if (character === 'soldier') {
        modelRoot.rotation.y = Math.PI;
      }
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
      if (!alive || !renderer) return;
      const dt = Math.min(0.05, clock.getDelta());
      if (mixer) mixer.update(dt);
      if (modelRoot) {
        const baseYaw = character === 'soldier' ? Math.PI : 0;
        modelRoot.rotation.y = baseYaw + Math.sin(clock.elapsedTime * 0.9) * 0.42;
      }
      renderer.render(scene, camera);
      if (isSoftwareGl) {
        timeoutId = window.setTimeout(tick, 90);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      shadowGeo.dispose();
      shadowMat.dispose();
      envRt?.dispose();
      if (renderer) {
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
        renderer.dispose();
      }
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
