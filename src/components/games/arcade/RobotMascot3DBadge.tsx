import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type RobotAnimationClip = 'Dance' | 'Wave' | 'ThumbsUp' | 'Jump' | 'Running' | 'Idle';

interface RobotMascot3DBadgeProps {
  clip?: RobotAnimationClip;
  className?: string;
  label?: string;
}

export const RobotMascot3DBadge: React.FC<RobotMascot3DBadgeProps> = ({
  clip = 'Dance',
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
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
      if (!gl) {
        setFallbackActive(true);
        return;
      }
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      setFallbackActive(true);
      return;
    }

    const w = Math.max(88, host.clientWidth || 112);
    const h = Math.max(88, host.clientHeight || 112);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setFallbackActive(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 40);
    camera.position.set(0, 2.35, 6.4);
    camera.lookAt(0, 1.65, 0);

    const hemi = new THREE.HemisphereLight('#e0f2fe', '#1e1b4b', 1.35);
    const key = new THREE.DirectionalLight('#ffffff', 2.0);
    key.position.set(3, 6, 4);
    const rim = new THREE.DirectionalLight('#38bdf8', 1.2);
    rim.position.set(-4, 3, -4);
    scene.add(hemi, key, rim);

    let mixer: THREE.AnimationMixer | null = null;
    let modelRoot: THREE.Object3D | null = null;
    let alive = true;
    let rafId = 0;
    const clock = new THREE.Clock();

    const loader = new GLTFLoader();
    const glbUrl =
      window.location.protocol === 'file:'
        ? './assets/games/models/RobotExpressive.glb'
        : '/assets/games/models/RobotExpressive.glb';

    loader.load(
      glbUrl,
      (gltf) => {
        if (!alive) return;
        modelRoot = gltf.scene;
        modelRoot.scale.setScalar(0.72);
        modelRoot.position.y = -0.2;
        scene.add(modelRoot);
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(modelRoot);
          const wanted =
            gltf.animations.find((a) => a.name.toLowerCase() === clip.toLowerCase()) ||
            gltf.animations.find((a) => a.name === 'Dance') ||
            gltf.animations[0];
          mixer.clipAction(wanted).play();
        }
      },
      undefined,
      () => {
        if (alive) setFallbackActive(true);
      }
    );

    const tick = () => {
      if (!alive || !renderer) return;
      const dt = Math.min(0.05, clock.getDelta());
      if (mixer) mixer.update(dt);
      if (modelRoot) {
        modelRoot.rotation.y = Math.sin(clock.elapsedTime * 0.9) * 0.45;
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      if (renderer) {
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
        renderer.dispose();
      }
      host.innerHTML = '';
    };
  }, [clip]);

  if (fallbackActive) {
    return (
      <div className={`relative flex items-center justify-center ${className}`} aria-label={label}>
        <img
          src="/assets/games/toon/robot_cheer0.png"
          alt={label}
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain drop-shadow-[0_6px_16px_rgba(56,189,248,0.4)]"
        />
      </div>
    );
  }

  return <div ref={hostRef} className={`relative overflow-hidden ${className}`} aria-label={label} />;
};
