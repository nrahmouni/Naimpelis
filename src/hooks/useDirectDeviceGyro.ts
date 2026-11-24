import { useCallback, useEffect, useRef, useState } from 'react';
import { triggerHaptic } from '../utils/haptics';

export interface DirectGyroSample {
  active: boolean;
  steer: number;
  pitch: number;
  swing: number;
}

export function useDirectDeviceGyro(options?: {
  maxDeg?: number;
  pitchMaxDeg?: number;
  deadzoneDeg?: number;
  onSwing?: (strength: number) => void;
}) {
  const maxDeg = options?.maxDeg ?? 28;
  const pitchMaxDeg = options?.pitchMaxDeg ?? 24;
  const deadzoneDeg = options?.deadzoneDeg ?? 2.8;

  const [supported] = useState<boolean>(
    () => typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
  );
  const [active, setActive] = useState(false);
  const [denied, setDenied] = useState(false);

  const gyroRef = useRef<DirectGyroSample>({ active: false, steer: 0, pitch: 0, swing: 0 });
  const rawXRef = useRef(0);
  const rawYRef = useRef(45);
  const zeroXRef = useRef<number | null>(null);
  const zeroYRef = useRef<number | null>(null);
  const filteredXRef = useRef(0);
  const filteredYRef = useRef(0);
  const swingPowerRef = useRef(0);
  const lastSwingAtRef = useRef(0);
  const onSwingRef = useRef(options?.onSwing);
  onSwingRef.current = options?.onSwing;

  const recalibrate = useCallback(() => {
    triggerHaptic('light');
    zeroXRef.current = rawXRef.current;
    zeroYRef.current = rawYRef.current;
    filteredXRef.current = 0;
    filteredYRef.current = 0;
    gyroRef.current = { active: gyroRef.current.active, steer: 0, pitch: 0, swing: 0 };
  }, []);

  const toggle = useCallback(async (): Promise<boolean> => {
    triggerHaptic('medium');
    if (active) {
      setActive(false);
      gyroRef.current = { active: false, steer: 0, pitch: 0, swing: 0 };
      return false;
    }
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setDenied(true);
      return false;
    }

    const devOri = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    const devMot = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : {}) as {
      requestPermission?: () => Promise<string>;
    };

    try {
      if (typeof devOri.requestPermission === 'function') {
        const res = await devOri.requestPermission();
        if (typeof devMot.requestPermission === 'function') {
          await devMot.requestPermission().catch(() => 'granted');
        }
        if (res !== 'granted') {
          setDenied(true);
          return false;
        }
      }
      zeroXRef.current = null;
      zeroYRef.current = null;
      filteredXRef.current = 0;
      filteredYRef.current = 0;
      swingPowerRef.current = 0;
      gyroRef.current = { active: true, steer: 0, pitch: 0, swing: 0 };
      setDenied(false);
      setActive(true);
      return true;
    } catch {
      setDenied(true);
      return false;
    }
  }, [active]);

  useEffect(() => {
    gyroRef.current.active = active;
    if (!active || typeof window === 'undefined') return;

    const getScreenAngle = (): number => {
      const ang = window.screen?.orientation?.angle;
      if (typeof ang === 'number') return ang;
      const legacy = (window as unknown as { orientation?: number }).orientation;
      return typeof legacy === 'number' ? legacy : 0;
    };

    const onOrientation = (ev: DeviceOrientationEvent) => {
      const beta = typeof ev.beta === 'number' ? ev.beta : 45;
      const gamma = typeof ev.gamma === 'number' ? ev.gamma : 0;
      const angle = getScreenAngle();

      let xDeg = gamma;
      let yDeg = beta;
      if (angle === 90) {
        xDeg = beta;
        yDeg = -gamma;
      } else if (angle === -90 || angle === 270) {
        xDeg = -beta;
        yDeg = gamma;
      }

      rawXRef.current = xDeg;
      rawYRef.current = yDeg;
      if (zeroXRef.current === null) zeroXRef.current = xDeg;
      if (zeroYRef.current === null) zeroYRef.current = yDeg;

      const dx = xDeg - zeroXRef.current;
      let targetSteer = 0;
      if (Math.abs(dx) > deadzoneDeg) {
        const adj = (Math.abs(dx) - deadzoneDeg) * Math.sign(dx);
        targetSteer = Math.max(-1, Math.min(1, adj / Math.max(8, maxDeg - deadzoneDeg)));
      }

      const dy = zeroYRef.current - yDeg;
      let targetPitch = 0;
      if (Math.abs(dy) > deadzoneDeg) {
        const adjY = (Math.abs(dy) - deadzoneDeg) * Math.sign(dy);
        targetPitch = Math.max(-1, Math.min(1, adjY / Math.max(8, pitchMaxDeg - deadzoneDeg)));
      }

      filteredXRef.current = filteredXRef.current * 0.55 + targetSteer * 0.45;
      filteredYRef.current = filteredYRef.current * 0.58 + targetPitch * 0.42;

      if (Date.now() - lastSwingAtRef.current > 220) {
        swingPowerRef.current = Math.max(0, swingPowerRef.current * 0.68);
      }

      gyroRef.current = {
        active: true,
        steer: Number(filteredXRef.current.toFixed(3)),
        pitch: Number(filteredYRef.current.toFixed(3)),
        swing: Number(swingPowerRef.current.toFixed(2)),
      };
    };

    const onMotion = (ev: DeviceMotionEvent) => {
      const acc = ev.acceleration || ev.accelerationIncludingGravity;
      if (!acc) return;
      const ax = acc.x || 0;
      const ay = acc.y || 0;
      const az = acc.z || 0;
      const mag = Math.sqrt(ax * ax + ay * ay + az * az);
      const net = ev.acceleration ? mag : Math.abs(mag - 9.81);
      if (net > 4.2) {
        const norm = Math.min(3, (net - 3.2) / 5.0);
        const now = Date.now();
        if (norm > swingPowerRef.current) {
          swingPowerRef.current = norm;
          gyroRef.current.swing = Number(norm.toFixed(2));
        }
        if (now - lastSwingAtRef.current > 240) {
          lastSwingAtRef.current = now;
          onSwingRef.current?.(norm);
        } else {
          lastSwingAtRef.current = now;
        }
      }
    };

    window.addEventListener('deviceorientation', onOrientation, true);
    window.addEventListener('devicemotion', onMotion, true);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true);
      window.removeEventListener('devicemotion', onMotion, true);
    };
  }, [active, deadzoneDeg, maxDeg, pitchMaxDeg]);

  return {
    supported,
    active,
    denied,
    gyroRef,
    toggle,
    recalibrate,
  };
}
