import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const DEFAULTS = {
  name: 'Pika', body: 'round', ears: 'long', tail: 'bolt', eyes: 'happy',
  accessory: 'none', color: '#f6cc54', accent: '#88684c', belly: '#fff0bd',
  type: 'electric', size: 1, earSize: 1,
};

const clamp = (value, min, max, fallback = 1) => {
  const number = Number(value);
  return Number.isFinite(number) ? THREE.MathUtils.clamp(number, min, max) : fallback;
};

export function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) {
      for (const material of [].concat(node.material)) materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export function buildCreature(config, { lowDetail = false } = {}) {
  config = { ...DEFAULTS, ...config };
  const creature = new THREE.Group();
  creature.name = config.name || 'My creature';
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.55, metalness: 0 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: config.accent, roughness: 0.64 });
  const bellyMaterial = new THREE.MeshStandardMaterial({ color: config.belly, roughness: 0.65 });
  const blackMaterial = new THREE.MeshStandardMaterial({ color: '#292c28', roughness: 0.24 });
  const tipMaterial = new THREE.MeshStandardMaterial({ color: '#34372f', roughness: 0.66 });
  const whiteMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const blushColors = { electric: '#e94c37', fire: '#fa8b5c', water: '#f4a5ad', grass: '#ef9c8d', fairy: '#e582a9', ghost: '#d798df' };
  const blushMaterial = new THREE.MeshStandardMaterial({ color: blushColors[config.type] || '#ef6d53', roughness: 0.62 });
  const greenMaterial = new THREE.MeshStandardMaterial({ color: '#65a878', roughness: 0.65 });
  const flowerMaterial = new THREE.MeshStandardMaterial({ color: '#f4b4c7', roughness: 0.6 });
  const sphereGeometry = new THREE.SphereGeometry(1, lowDetail ? 14 : 40, lowDetail ? 10 : 28);

  function sphere(name, material, position, scale, parent = creature) {
    const mesh = new THREE.Mesh(sphereGeometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function curve(name, points, radius, material, parent = creature) {
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))), lowDetail ? 12 : 32, radius, lowDetail ? 5 : 8, false);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function extrude(name, points, depth, material, parent = creature) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: true, bevelSegments: lowDetail ? 1 : 3, bevelSize: 0.045, bevelThickness: 0.045, curveSegments: lowDetail ? 8 : 18 });
    geometry.translate(0, 0, -depth / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  const bodyScale = config.body === 'slim' ? [0.66, 0.94, 0.56] : config.body === 'chunky' ? [0.99, 0.83, 0.73] : [0.82, 0.86, 0.65];
  sphere('Soft round body', bodyMaterial, [0, 1.18, -0.04], bodyScale);
  sphere('Cream tummy', bellyMaterial, [0, 1.13, bodyScale[2] - 0.035], [bodyScale[0] * 0.63, 0.57, 0.075]);

  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 2.31, 0.05);
  creature.add(head);
  sphere('Cheeky head', bodyMaterial, [0, 0, 0], [1.02, 0.88, 0.83], head);

  for (const side of [-1, 1]) {
    const label = side < 0 ? 'Left' : 'Right';
    const arm = sphere(`${label} arm`, bodyMaterial, [side * bodyScale[0] * 0.92, 1.26, 0.1], [0.265, 0.46, 0.29]);
    arm.rotation.z = side * -0.38;
    const foot = sphere(`${label} foot`, bodyMaterial, [side * 0.48, 0.27, 0.23], [0.37, 0.235, 0.49]);
    foot.rotation.y = side * 0.17;
    for (let toe = 0; toe < 2; toe += 1) {
      curve(`${label} toe ${toe + 1}`, [
        [side * 0.48 + (toe - 0.5) * 0.14, 0.36, 0.64],
        [side * 0.48 + (toe - 0.5) * 0.14, 0.32, 0.686],
      ], 0.008, accentMaterial);
    }

    const cheek = sphere(`${label} rosy cheek`, blushMaterial, [side * 0.69, -0.2, 0.581], [0.165, 0.155, 0.027], head);
    cheek.rotation.y = side * 0.59;
    cheek.rotation.x = 0.17;

    if (config.eyes === 'sleepy') {
      curve(`${label} sleepy eye`, [[side * 0.35 - 0.12, 0.1, 0.795], [side * 0.35, 0.055, 0.84], [side * 0.35 + 0.12, 0.1, 0.795]], 0.028, blackMaterial, head);
    } else {
      const eyeHeight = config.eyes === 'round' ? 0.225 : 0.198;
      const eye = sphere(`${label} glossy eye`, blackMaterial, [side * 0.365, 0.12, 0.755], [0.151, eyeHeight, 0.092], head);
      eye.rotation.y = side * 0.12;
      sphere(`${label} eye sparkle`, whiteMaterial, [side * 0.365 - 0.036, 0.19, 0.838], [0.046, 0.061, 0.017], head);
      sphere(`${label} tiny eye sparkle`, whiteMaterial, [side * 0.365 + 0.039, 0.056, 0.837], [0.018, 0.022, 0.009], head);
    }
  }

  sphere('Little nose', blackMaterial, [0, -0.12, 0.855], [0.054, 0.036, 0.03], head);
  curve('Happy little smile', [[-0.2, -0.255, 0.811], [-0.115, -0.303, 0.843], [0, -0.259, 0.867], [0.115, -0.303, 0.843], [0.2, -0.255, 0.811]], 0.018, blackMaterial, head);

  const ears = [];
  const earSize = clamp(config.earSize, 0.5, 1.5);
  for (const side of [-1, 1]) {
    if (config.ears === 'none') continue;
    const ear = new THREE.Group();
    ear.name = side < 0 ? 'Left ear' : 'Right ear';
    ear.position.set(side * 0.62, 0.62, -0.04);
    ear.rotation.z = side * -0.25;
    ear.scale.setScalar(earSize);
    head.add(ear);
    ears.push({ group: ear, rest: ear.rotation.z, side });
    if (config.ears === 'round') {
      sphere('Round ear', bodyMaterial, [0, 0.18, 0], [0.33, 0.35, 0.2], ear);
      sphere('Inner ear', blushMaterial, [0, 0.2, 0.176], [0.18, 0.2, 0.025], ear);
    } else if (config.ears === 'pointy') {
      const earMesh = extrude('Pointed ear', [[-0.25, 0], [-0.19, 0.4], [0.04, 0.85], [0.23, 0.34], [0.25, 0]], 0.2, bodyMaterial, ear);
      earMesh.rotation.x = -0.09;
      const inner = extrude('Inner pointed ear', [[-0.13, 0.15], [0.03, 0.62], [0.14, 0.15]], 0.015, blushMaterial, ear);
      inner.position.z = 0.14;
    } else {
      const lower = new THREE.LatheGeometry([
        new THREE.Vector2(0, -0.1), new THREE.Vector2(0.14, 0), new THREE.Vector2(0.205, 0.28),
        new THREE.Vector2(0.187, 0.62), new THREE.Vector2(0.15, 0.83),
      ], lowDetail ? 14 : 36);
      const mesh = new THREE.Mesh(lower, bodyMaterial);
      mesh.name = 'Long golden ear';
      mesh.scale.set(1, 1, 0.54);
      mesh.castShadow = true;
      ear.add(mesh);
      const tip = new THREE.Mesh(new THREE.LatheGeometry([
        new THREE.Vector2(0.15, 0.83), new THREE.Vector2(0.124, 0.99), new THREE.Vector2(0.072, 1.17), new THREE.Vector2(0, 1.29),
      ], lowDetail ? 14 : 36), tipMaterial);
      tip.name = 'Dark ear tip';
      tip.scale.z = 0.54;
      tip.castShadow = true;
      ear.add(tip);
    }
  }

  const tail = new THREE.Group();
  tail.name = 'Tail';
  tail.position.set(0.59, 0.9, -0.47);
  tail.rotation.y = -0.1;
  creature.add(tail);
  if (config.tail === 'bolt') {
    extrude('Lightning tail', [[-0.12, 0], [0.23, 0.23], [0.1, 0.65], [0.51, 0.57], [0.37, 1.02], [0.91, 1.55], [1.26, 1.18], [0.72, 0.87], [0.9, 0.4], [0.49, 0.46], [0.55, 0.08], [0.1, -0.2]], 0.16, bodyMaterial, tail);
    extrude('Warm tail base', [[-0.12, 0], [0.23, 0.23], [0.32, 0.08], [0.23, -0.1], [0.1, -0.2]], 0.168, accentMaterial, tail);
  } else if (config.tail === 'curly') {
    curve('Curly tail', [[0, 0, 0], [0.5, 0.1, -0.1], [1, 0.45, -0.08], [1.03, 0.88, 0], [0.75, 1.12, 0.03], [0.5, 0.98, 0.04], [0.52, 0.72, 0.04], [0.72, 0.71, 0.03]], 0.105, bodyMaterial, tail);
  } else if (config.tail === 'leaf') {
    curve('Leaf stem', [[0, 0, 0], [0.5, 0.25, -0.08], [0.65, 0.67, 0]], 0.075, accentMaterial, tail);
    const leaf = sphere('Leaf tail', greenMaterial, [0.81, 0.97, 0], [0.31, 0.65, 0.075], tail);
    leaf.rotation.z = -0.4;
    curve('Leaf vein', [[0.6, 0.46, 0.08], [0.81, 0.98, 0.08], [1.04, 1.5, 0.08]], 0.015, bellyMaterial, tail);
  } else if (config.tail === 'flame') {
    curve('Curved tail', [[0, 0, 0], [0.5, 0.03, -0.15], [0.91, 0.31, -0.1], [0.98, 0.66, 0]], 0.13, bodyMaterial, tail);
    const fireMaterial = new THREE.MeshStandardMaterial({ color: '#f47e45', roughness: 0.54, emissive: '#b52e0c', emissiveIntensity: 0.12 });
    const coreMaterial = new THREE.MeshStandardMaterial({ color: '#ffd678', roughness: 0.6, emissive: '#e79d28', emissiveIntensity: 0.13 });
    sphere('Orange flame', fireMaterial, [0.99, 0.92, 0], [0.27, 0.44, 0.22], tail);
    const flameTip = sphere('Flame tip', fireMaterial, [1.07, 1.19, 0], [0.13, 0.33, 0.13], tail);
    flameTip.rotation.z = -0.3;
    sphere('Golden flame center', coreMaterial, [0.99, 0.85, 0.17], [0.16, 0.27, 0.07], tail);
  }

  // The little markings also give the character a finished back when rotated.
  for (let stripe = 0; stripe < 2; stripe += 1) {
    sphere(`Back marking ${stripe + 1}`, accentMaterial, [0, 1.22 + stripe * 0.31, -bodyScale[2] + 0.005], [bodyScale[0] * 0.51, 0.08, 0.055]);
  }

  if (config.accessory === 'scarf') {
    const scarfMaterial = new THREE.MeshStandardMaterial({ color: '#74a5bc', roughness: 0.8 });
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.14, lowDetail ? 6 : 14, lowDetail ? 24 : 64), scarfMaterial);
    scarf.name = 'Cozy blue scarf';
    scarf.rotation.x = Math.PI / 2;
    scarf.scale.set(1.28, 1, 1);
    scarf.position.set(0, 1.78, 0);
    scarf.castShadow = true;
    creature.add(scarf);
    const end = sphere('Scarf end', scarfMaterial, [0.39, 1.45, 0.62], [0.16, 0.4, 0.07]);
    end.rotation.z = 0.2;
    sphere('Scarf knot', scarfMaterial, [0.37, 1.77, 0.53], [0.2, 0.16, 0.14]);
  } else if (config.accessory === 'flower') {
    const flower = new THREE.Group();
    flower.name = 'Flower accessory';
    flower.position.set(-0.72, 0.54, 0.48);
    flower.rotation.z = 0.2;
    head.add(flower);
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = petal / 5 * Math.PI * 2;
      const mesh = sphere(`Flower petal ${petal + 1}`, flowerMaterial, [Math.sin(angle) * 0.17, Math.cos(angle) * 0.17, 0], [0.12, 0.18, 0.06], flower);
      mesh.rotation.z = -angle;
    }
    sphere('Flower center', bellyMaterial, [0, 0, 0.075], [0.11, 0.11, 0.055], flower);
  } else if (config.accessory === 'sprout') {
    curve('Sprout stem', [[0, 0.8, 0], [0, 1.04, 0], [0.06, 1.19, 0]], 0.036, greenMaterial, head);
    const leftLeaf = sphere('Left sprout leaf', greenMaterial, [-0.17, 1.12, 0], [0.25, 0.105, 0.07], head);
    leftLeaf.rotation.z = -0.4;
    const rightLeaf = sphere('Right sprout leaf', greenMaterial, [0.19, 1.22, 0], [0.26, 0.115, 0.07], head);
    rightLeaf.rotation.z = 0.45;
  }

  creature.scale.setScalar(clamp(config.size, 0.65, 1.3));
  creature.userData = { creator: 'Poké Studio', type: config.type, design: { ...config } };
  // Some optional materials may be unused, so release those immediately.
  const usedMaterials = new Set();
  creature.traverse((node) => { if (node.material) usedMaterials.add(node.material); });
  [bodyMaterial, accentMaterial, bellyMaterial, blackMaterial, tipMaterial, whiteMaterial, blushMaterial, greenMaterial, flowerMaterial]
    .forEach((material) => { if (!usedMaterials.has(material)) material.dispose(); });
  return { creature, ears };
}

export function createScene(container, initialConfig = {}) {
  let config = { ...DEFAULTS, ...initialConfig };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor('#eaf0e6', 0);
  renderer.domElement.setAttribute('aria-label', '드래그해서 회전하고 스크롤해서 확대할 수 있는 3D 포켓몬 미리보기');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 5.5;
  controls.maxDistance = 14;
  controls.maxPolarAngle = Math.PI * 0.53;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.7;
  controls.autoRotateSpeed = 1.25;

  scene.add(new THREE.HemisphereLight('#fff9e7', '#b4c6b1', 1.85));
  const keyLight = new THREE.DirectionalLight('#fff7de', 3);
  keyLight.position.set(-3, 7, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -5;
  keyLight.shadow.camera.right = 5;
  keyLight.shadow.camera.top = 6;
  keyLight.shadow.camera.bottom = -4;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 20;
  keyLight.shadow.normalBias = 0.025;
  keyLight.shadow.bias = -0.00015;
  keyLight.shadow.radius = 5;
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight('#d5edff', 1.15);
  fillLight.position.set(4, 3, -3);
  scene.add(fillLight);

  const stage = new THREE.Group();
  stage.name = 'Studio stage';
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.83, 0.12, 96), new THREE.MeshStandardMaterial({ color: '#eff2e8', roughness: 0.9 }));
  podium.position.y = -0.035;
  podium.receiveShadow = true;
  stage.add(podium);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const context = shadowCanvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(46,61,43,0.28)');
  gradient.addColorStop(0.45, 'rgba(46,61,43,0.12)');
  gradient.addColorStop(1, 'rgba(46,61,43,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 3.4), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.7 }));
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.029;
  stage.add(contactShadow);
  scene.add(stage);

  let model = buildCreature(config);
  scene.add(model.creature);
  let disposed = false;
  let active = true;
  let width = 1;
  let height = 1;
  let fittedDistance = 8.8;
  let frame;
  const clock = new THREE.Clock();
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionPreference.matches;
  const onMotionChange = (event) => { reducedMotion = event.matches; };
  motionPreference.addEventListener?.('change', onMotionChange);

  function fitCamera(reset = false) {
    const bounds = new THREE.Box3().setFromObject(model.creature);
    bounds.min.y = Math.min(bounds.min.y, -0.12);
    const dimensions = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const halfFovTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const projectedWidth = dimensions.x * 0.94 + dimensions.z * 0.33;
    const nextDistance = Math.max(
      5.7,
      dimensions.y / (2 * halfFovTangent * 0.81),
      projectedWidth / (2 * halfFovTangent * camera.aspect * 0.86),
    );
    const previousOffset = camera.position.clone().sub(controls.target);
    const zoomRatio = reset ? 1 : previousOffset.length() / fittedDistance;
    fittedDistance = nextDistance;
    controls.maxDistance = Math.max(14, fittedDistance * 1.65);
    controls.minDistance = Math.min(5.5, fittedDistance * 0.65);
    controls.target.set(0.13 * clamp(config.size, 0.65, 1.3), center.y, 0);
    const offset = reset ? new THREE.Vector3(0.33, 0.13, 0.94).normalize() : previousOffset.normalize();
    camera.position.copy(controls.target).add(offset.multiplyScalar(THREE.MathUtils.clamp(fittedDistance * zoomRatio, controls.minDistance, controls.maxDistance)));
    controls.update();
  }

  function resetCamera() { fitCamera(true); }

  function resize() {
    const bounds = container.getBoundingClientRect();
    const previousAspect = width / height;
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (Math.abs(previousAspect - camera.aspect) > 0.5) resetCamera();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  resetCamera();

  function render() {
    if (disposed || !active) return;
    const delta = Math.min(0.05, clock.getDelta());
    const elapsed = clock.elapsedTime;
    if (!reducedMotion) {
      model.creature.position.y = Math.sin(elapsed * 1.7) * 0.025;
      model.ears.forEach(({ group, rest, side }) => { group.rotation.z = rest + Math.sin(elapsed * 1.6 + side * 0.7) * 0.013; });
    } else {
      model.creature.position.y = 0;
      model.ears.forEach(({ group, rest }) => { group.rotation.z = rest; });
    }
    controls.update(delta);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  }
  render();

  return {
    setActive(enabled) {
      const next = Boolean(enabled);
      if (disposed || next === active) return;
      active = next;
      controls.enabled = next;
      if (next) {
        clock.getDelta();
        resize();
        render();
      } else {
        cancelAnimationFrame(frame);
      }
    },
    setName(name) {
      config.name = String(name || 'My creature');
      model.creature.name = config.name;
      model.creature.userData.design.name = config.name;
    },
    update(nextConfig) {
      if (disposed) return;
      config = { ...config, ...nextConfig };
      const old = model;
      model = buildCreature(config);
      scene.add(model.creature);
      scene.remove(old.creature);
      disposeTree(old.creature);
      fitCamera();
    },
    resetCamera,
    zoom(delta) {
      const direction = camera.position.clone().sub(controls.target);
      const nextDistance = THREE.MathUtils.clamp(direction.length() + Number(delta), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(direction.setLength(nextDistance));
      controls.update();
    },
    setSpin(enabled) { controls.autoRotate = Boolean(enabled); },
    setBackground(color) {
      scene.background = color && color !== 'transparent' ? new THREE.Color(color) : null;
    },
    capture() {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
    async exportGLB() {
      const exportModel = model.creature.clone(true);
      exportModel.position.y = 0;
      exportModel.name = config.name || 'My creature';
      exportModel.updateMatrixWorld(true);
      const exporter = new GLTFExporter();
      return new Promise((resolve, reject) => {
        exporter.parse(exportModel, (result) => {
          if (result instanceof ArrayBuffer) resolve(result);
          else reject(new Error('The model could not be exported as GLB.'));
        }, reject, { binary: true, onlyVisible: true });
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      motionPreference.removeEventListener?.('change', onMotionChange);
      controls.dispose();
      disposeTree(model.creature);
      disposeTree(stage);
      shadowTexture.dispose();
      keyLight.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
