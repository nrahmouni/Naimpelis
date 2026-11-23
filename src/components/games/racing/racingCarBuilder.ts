import * as THREE from 'three';

export interface BuiltCarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  frontWheelPivots: [THREE.Group, THREE.Group];
  wheelSpinGroups: THREE.Group[];
  brakeLightMaterial: THREE.MeshStandardMaterial;
  nitroFlames: [THREE.Mesh, THREE.Mesh];
  dispose: () => void;
}

export function buildFormulaGtCar(
  primaryHex: number,
  accentHex: number,
  options?: { castShadow?: boolean; isPlayer?: boolean }
): BuiltCarRig {
  const castShadow = Boolean(options?.castShadow);
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

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
      metalness: 0.45,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    })
  );

  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: options?.isPlayer ? 0.38 : 0.2,
      metalness: 0.35,
      roughness: 0.3,
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
      emissiveIntensity: 2.2,
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

  // Underfloor / Carbon Splitter
  const floorMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.92, 0.14, 4.35)), carbonMat);
  floorMesh.position.set(0, 0.28, 0);
  floorMesh.castShadow = castShadow;
  bodyGroup.add(floorMesh);

  // Main Sculpted Chassis
  const chassisMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.74, 0.42, 3.65)), paintMat);
  chassisMesh.position.set(0, 0.54, 0.08);
  chassisMesh.castShadow = castShadow;
  bodyGroup.add(chassisMesh);

  // Tapered Nose Cone (pointing -Z forward)
  const noseMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.04, 0.26, 1.15)), paintMat);
  noseMesh.position.set(0, 0.46, -1.92);
  noseMesh.rotation.x = 0.08;
  noseMesh.castShadow = castShadow;
  bodyGroup.add(noseMesh);

  // Racing Livery Spine Stripe
  const stripeMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.44, 3.72)), accentMat);
  stripeMesh.position.set(0, 0.56, 0.02);
  bodyGroup.add(stripeMesh);

  // Aerodynamic Canopy / Cockpit
  const cockpitMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.06, 0.38, 1.55)), glassMat);
  cockpitMesh.position.set(0, 0.88, 0.16);
  cockpitMesh.castShadow = castShadow;
  bodyGroup.add(cockpitMesh);

  // Side Air Intakes
  const intakeGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.26, 1.45));
  [-0.92, 0.92].forEach((x) => {
    const pod = new THREE.Mesh(intakeGeo, paintMat);
    pod.position.set(x, 0.52, 0.32);
    pod.castShadow = castShadow;
    bodyGroup.add(pod);
  });

  // Front Aero Wing + Endplates
  const frontWing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.14, 0.07, 0.46)), carbonMat);
  frontWing.position.set(0, 0.26, -2.28);
  bodyGroup.add(frontWing);

  const frontLip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.16, 0.04, 0.12)), accentMat);
  frontLip.position.set(0, 0.26, -2.47);
  bodyGroup.add(frontLip);

  // Rear GT Wing + Struts
  const strutGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.46, 0.24));
  [-0.48, 0.48].forEach((x) => {
    const strut = new THREE.Mesh(strutGeo, carbonMat);
    strut.position.set(x, 0.92, 1.72);
    bodyGroup.add(strut);
  });

  const rearWing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 0.08, 0.44)), carbonMat);
  rearWing.position.set(0, 1.15, 1.78);
  rearWing.rotation.x = -0.14;
  rearWing.castShadow = castShadow;
  bodyGroup.add(rearWing);

  const endPlateGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.34, 0.5));
  [-1.06, 1.06].forEach((x) => {
    const plate = new THREE.Mesh(endPlateGeo, accentMat);
    plate.position.set(x, 1.12, 1.78);
    bodyGroup.add(plate);
  });

  // Front Headlights
  const headGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.09, 0.1));
  [-0.58, 0.58].forEach((x) => {
    const hl = new THREE.Mesh(headGeo, headlightMat);
    hl.position.set(x, 0.5, -1.78);
    bodyGroup.add(hl);
  });

  // Rear Brake Light Bar + Diffuser
  const tailGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.1, 0.08));
  [-0.56, 0.56].forEach((x) => {
    const tl = new THREE.Mesh(tailGeo, brakeLightMaterial);
    tl.position.set(x, 0.58, 1.92);
    bodyGroup.add(tl);
  });

  // Dynamic Nitro Exhaust Cones
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
  flameL.position.set(-0.26, 0.42, 2.32);
  flameL.visible = false;
  const flameR = new THREE.Mesh(flameGeo, flameMat);
  flameR.position.set(0.26, 0.42, 2.32);
  flameR.visible = false;
  bodyGroup.add(flameL, flameR);

  // Wheels (4 independent spin groups, front 2 wrapped in steering pivots)
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
  createWheel(-1.02, 1.38);
  createWheel(1.02, 1.38);

  // Soft Ground Contact Shadow Plane (zero GPU cost)
  const shadowPlane = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(2.5, 4.9)),
    trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      })
    )
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.03;
  root.add(shadowPlane);

  return {
    root,
    bodyGroup,
    frontWheelPivots: [frontLeftPivot, frontRightPivot],
    wheelSpinGroups,
    brakeLightMaterial,
    nitroFlames: [flameL, flameR],
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
