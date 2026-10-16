import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCreature, disposeTree } from './scene.js';
import { REGIONS, WORLD_BOUNDS } from './world-data.js';

const TAU = Math.PI * 2;
const POND = { x: 34, z: 7, rx: 11, rz: 8 };
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const coast = (x, z) => Math.pow((x / 75) ** 4 + (z / 75) ** 4, 0.25) + Math.sin(x * 0.12 + z * 0.07) * 0.018;
const pondDistance = (x, z) => Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);

function groundHeight(x, z) {
  const smooth = Math.sin(x * 0.072) * 0.33 + Math.cos(z * 0.084) * 0.26 + Math.sin((x + z) * 0.11) * 0.13;
  const pondBlend = clamp((pondDistance(x, z) - 1) * 2.5, 0, 1);
  return lerp(0.13, smooth, pondBlend) - Math.max(0, coast(x, z) - 0.91) * 28;
}

function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** A self-contained world renderer. UI, save data and interaction rules live outside it. */
export function createWorldScene(container, options = {}) {
  const random = seededRandom(78329);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c3e2e0');
  scene.fog = new THREE.Fog('#c3e2e0', 58, 155);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.15, 300);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '포켓몬 오픈월드. WASD 또는 방향키로 이동, Shift로 달리기, Space로 점프, E로 상호작용.');
  canvas.setAttribute('role', 'img');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
  container.appendChild(canvas);

  const environment = new THREE.Group();
  scene.add(environment);
  scene.add(new THREE.HemisphereLight('#fff8e3', '#839878', 2.3));
  const sun = new THREE.DirectionalLight('#fff0cf', 2.8);
  sun.position.set(-18, 32, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.00025;
  scene.add(sun, sun.target);
  const coolLight = new THREE.DirectionalLight('#c6e6ee', 0.4);
  coolLight.position.set(15, 14, -10);
  scene.add(coolLight);

  const materials = new Map();
  function material(color, extra = {}) {
    const key = color + JSON.stringify(extra);
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.98, flatShading: true, ...extra }));
    return materials.get(key);
  }
  function mesh(geometry, color, x, y, z, scale, parent = environment) {
    const object = new THREE.Mesh(geometry, typeof color === 'string' ? material(color) : color);
    object.position.set(x, y, z);
    if (scale) object.scale.set(...scale);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  const colliders = [];
  const occlusionInstances = [];
  const occlusionMeshes = [];
  const landmarks = options.landmarks || [];
  const spawnClearings = options.spawns || [];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const stone = new THREE.IcosahedronGeometry(1, 0);
  const foliage = new THREE.IcosahedronGeometry(1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const cone = new THREE.ConeGeometry(1, 1, 7);

  // Vertex colors keep the land soft and organic without expensive texture maps.
  const terrainGeometry = new THREE.PlaneGeometry(164, 164, 100, 100);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPositions = terrainGeometry.attributes.position;
  const terrainColors = [];
  const grassy = new THREE.Color('#a6c97d');
  const forestGreen = new THREE.Color('#82b69a');
  const canyon = new THREE.Color('#d7b380');
  const ancient = new THREE.Color('#aaa4c5');
  const sand = new THREE.Color('#eee0b0');
  for (let index = 0; index < terrainPositions.count; index += 1) {
    const x = terrainPositions.getX(index);
    const z = terrainPositions.getZ(index);
    terrainPositions.setY(index, groundHeight(x, z));
    const color = grassy.clone();
    color.lerp(forestGreen, clamp((-x - 8) / 28, 0, 0.85));
    color.lerp(canyon, clamp((x - 12) / 35, 0, 0.86) * clamp((-z + 12) / 38, 0, 1));
    color.lerp(ancient, clamp((-z - 24) / 24, 0, 0.76) * clamp(1 - Math.abs(x) / 35, 0, 1));
    color.lerp(sand, clamp((coast(x, z) - 0.88) * 14, 0, 1));
    color.multiplyScalar(0.96 + random() * 0.09);
    terrainColors.push(color.r, color.g, color.b);
  }
  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
  terrainGeometry.computeVertexNormals();
  const terrain = mesh(terrainGeometry, material('#ffffff', { vertexColors: true }), 0, 0, 0);
  terrain.castShadow = false;
  const ocean = mesh(new THREE.PlaneGeometry(1200, 1200), material('#83cbd0', { roughness: 0.65, metalness: 0.08 }), 0, -0.76, 0);
  ocean.rotation.x = -Math.PI / 2;
  ocean.castShadow = false;
  ocean.receiveShadow = false;

  function path(points, width = 3.1) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const vertices = [];
    const indices = [];
    for (let i = 0; i <= 100; i += 1) {
      const point = curve.getPoint(i / 100);
      const tangent = curve.getTangent(i / 100);
      for (const side of [-1, 1]) {
        const x = point.x - tangent.z * width * 0.5 * side;
        const z = point.z + tangent.x * width * 0.5 * side;
        vertices.push(x, groundHeight(x, z) + 0.028, z);
      }
      if (i < 100) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const road = mesh(geometry, material('#ddcd9f', { side: THREE.DoubleSide }), 0, 0, 0);
    road.castShadow = false;
    return curve;
  }
  const paths = [
    path([[0, 39], [0, 26], [2, 15], [-6, 5], [-23, -2], [-36, -14]]),
    path([[2, 15], [16, 19], [29, 21], [40, 18]], 2.7),
    path([[-6, 5], [-5, -14], [4, -29], [0, -45]], 2.6),
    path([[40, 18], [49, 5], [45, -14], [31, -27], [4, -29]], 2.3),
  ];
  const pathSamples = paths.flatMap((curve) => curve.getPoints(75));
  function isClearing(x, z, margin = 0) {
    return pondDistance(x, z) < 1.2 + margin / 10 ||
      Math.hypot(x, z - 26) < 10 + margin ||
      landmarks.some((item) => Math.hypot(x - item.x, z - item.z) < 6 + margin) ||
      spawnClearings.some((item) => Math.hypot(x - item.x, z - item.z) < 3 + margin) ||
      pathSamples.some((point) => Math.hypot(x - point.x, z - point.z) < 3.3 + margin);
  }

  const transform = new THREE.Object3D();
  function instanced(geometry, color, entries) {
    if (!entries.length) return null;
    const object = new THREE.InstancedMesh(geometry, material(color), entries.length);
    entries.forEach(({ x, y, z, sx = 1, sy = sx, sz = sx, rotation = 0, tint }, index) => {
      transform.position.set(x, y, z);
      transform.rotation.set(0, rotation, 0);
      transform.scale.set(sx, sy, sz);
      transform.updateMatrix();
      object.setMatrixAt(index, transform.matrix);
      if (tint) object.setColorAt(index, new THREE.Color(tint));
    });
    object.castShadow = true;
    object.receiveShadow = true;
    object.instanceMatrix.needsUpdate = true;
    environment.add(object);
    return object;
  }
  function registerCanopies(object, entries) {
    if (object) occlusionInstances.push({ object, entries, factors: new Float32Array(entries.length).fill(1) });
    return object;
  }
  function registerCanopy(object) {
    occlusionMeshes.push({ object, scale: object.scale.clone(), factor: 1 });
    return object;
  }

  const trunks = [], crowns = [], conifers = [], paleCrowns = [], rocks = [], canyonRocks = [], grasses = [];
  for (let i = 0; i < 230; i += 1) {
    const x = random() * 132 - 66;
    const z = random() * 132 - 66;
    if (coast(x, z) > 0.85 || isClearing(x, z)) continue;
    const h = groundHeight(x, z);
    const scale = 1.1 + random() * 1.2;
    const forest = x < -16;
    const ruins = z < -28 && Math.abs(x) < 25;
    if (x > 20 && z < -10) {
      canyonRocks.push({ x, y: h + scale * 0.5, z, sx: scale, sy: scale * (1.3 + random()), sz: scale * 0.7, rotation: random() * TAU });
      colliders.push({ x, z, radius: scale * 0.7 });
      continue;
    }
    trunks.push({ x, y: h + scale * 0.9, z, sx: scale * 0.18, sy: scale * 1.8, sz: scale * 0.18 });
    const target = ruins ? paleCrowns : crowns;
    if (forest && random() > 0.4) {
      conifers.push({ x, y: h + scale * 2.1, z, sx: scale * 1.18, sy: scale * 2.7, sz: scale * 1.18 });
      conifers.push({ x, y: h + scale * 3, z, sx: scale * 0.85, sy: scale * 2.2, sz: scale * 0.85 });
    } else {
      target.push({ x, y: h + scale * 2.05, z, sx: scale * 1.3, sy: scale * 1.15, sz: scale * 1.2, rotation: random() * TAU });
      target.push({ x: x + scale * 0.65, y: h + scale * 1.8, z: z + 0.2, sx: scale * 0.85, sy: scale * 0.8, sz: scale, rotation: random() * TAU });
    }
    colliders.push({ x, z, radius: 0.5 + scale * 0.17 });
  }
  for (let i = 0; i < 85; i += 1) {
    const x = random() * 128 - 64, z = random() * 128 - 64;
    if (coast(x, z) > 0.9 || isClearing(x, z, -0.8)) continue;
    const scale = 0.3 + random() * 0.7;
    rocks.push({ x, y: groundHeight(x, z) + scale * 0.3, z, sx: scale * 1.2, sy: scale * 0.65, sz: scale, rotation: random() * TAU });
    if (scale > 0.75) colliders.push({ x, z, radius: scale * 0.55 });
  }
  registerCanopies(instanced(cylinder, '#987e56', trunks), trunks);
  registerCanopies(instanced(foliage, '#86b76b', crowns), crowns);
  registerCanopies(instanced(cone, '#669e80', conifers), conifers);
  registerCanopies(instanced(foliage, '#b1a4d1', paleCrowns), paleCrowns);
  instanced(stone, '#aaa99a', rocks);
  instanced(stone, '#c99c7d', canyonRocks);

  // A few foreground trees frame the camp without obstructing its route.
  for (const [x, z, scale] of [[-10, 25, 1.35], [13, 28, 1.6], [-14, 37, 1.5], [11, 39, 1.3]]) {
    const h = groundHeight(x, z);
    registerCanopy(mesh(cylinder, '#9b8057', x, h + 1.1 * scale, z, [0.22 * scale, 2.2 * scale, 0.22 * scale]));
    registerCanopy(mesh(foliage, '#9abd72', x, h + 2.7 * scale, z, [1.65 * scale, 1.6 * scale, 1.55 * scale]));
    registerCanopy(mesh(foliage, '#b4ca79', x - 0.9 * scale, h + 2.25 * scale, z + 0.2, [1.2 * scale, 1.1 * scale, 1.1 * scale]));
    colliders.push({ x, z, radius: 0.7 });
  }

  const flowerHeads = [[], [], []], stems = [];
  for (let i = 0; i < 1100; i += 1) {
    const x = random() * 132 - 66, z = random() * 132 - 66;
    if (coast(x, z) > 0.88 || pondDistance(x, z) < 1.12 || pathSamples.some((point) => Math.hypot(x - point.x, z - point.z) < 1.5)) continue;
    const h = groundHeight(x, z);
    const s = 0.12 + random() * 0.15;
    grasses.push({ x, y: h + s, z, sx: s * 0.7, sy: s * 2, sz: s * 0.7, rotation: random() * TAU });
    if (i % 3 === 0 && !(x > 20 && z < -10)) {
      stems.push({ x, y: h + 0.2, z, sx: 0.035, sy: 0.4, sz: 0.035 });
      flowerHeads[i % 7 % 3].push({ x, y: h + 0.43, z, sx: 0.13, sy: 0.075, sz: 0.13 });
    }
  }
  instanced(cone, '#7ca55c', grasses);
  instanced(cylinder, '#789854', stems);
  instanced(foliage, '#fff0bb', flowerHeads[0]);
  instanced(foliage, '#e9a3ac', flowerHeads[1]);
  instanced(foliage, '#b6b2e4', flowerHeads[2]);

  // Pond edge, clear turquoise water and lily pads.
  const pondBank = mesh(new THREE.CircleGeometry(1, 64), '#d8d5ac', POND.x, 0.16, POND.z, [12.1, 9.1, 1]);
  pondBank.rotation.x = -Math.PI / 2;
  pondBank.castShadow = false;
  const pond = mesh(new THREE.CircleGeometry(1, 64), material('#7dc8ce', { roughness: 0.28, metalness: 0.12 }), POND.x, 0.18, POND.z, [POND.rx, POND.rz, 1]);
  pond.rotation.x = -Math.PI / 2;
  pond.castShadow = false;
  const ripples = [];
  for (let i = 0; i < 8; i += 1) {
    const x = POND.x + (random() - 0.5) * 15;
    const z = POND.z + (random() - 0.5) * 9;
    const ring = mesh(new THREE.RingGeometry(0.8, 0.84, 36), material('#c1e5dc', { transparent: true, opacity: 0.55, side: THREE.DoubleSide }), x, 0.2, z);
    ring.rotation.x = -Math.PI / 2;
    ring.castShadow = false;
    ring.userData.phase = random() * TAU;
    ripples.push(ring);
  }
  for (let i = 0; i < 7; i += 1) {
    const x = 28 + random() * 11, z = 4 + random() * 7;
    const pad = mesh(new THREE.CircleGeometry(0.45, 12, 0.2, TAU - 0.4), '#88ae77', x, 0.21, z);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = random() * TAU;
    pad.castShadow = false;
    if (i % 2 === 0) mesh(foliage, '#f0b5c4', x, 0.34, z, [0.18, 0.14, 0.18]);
  }
  for (let i = 0; i < 12; i += 1) {
    const angle = i / 12 * TAU;
    const x = POND.x + Math.cos(angle) * 11.8, z = POND.z + Math.sin(angle) * 8.8;
    mesh(stone, '#afbab1', x, groundHeight(x, z) + 0.25, z, [0.65, 0.45, 0.5]);
  }

  const clouds = [];
  for (let i = 0; i < 16; i += 1) {
    const x = random() * 220 - 110, z = random() * 220 - 110, y = 22 + random() * 13;
    for (let j = 0; j < 3; j += 1) clouds.push({ x: x + j * 3, y: y + (j === 1 ? 1 : 0), z, sx: 3.6, sy: 1.4 + random(), sz: 2.3 });
  }
  const cloudMesh = instanced(foliage, '#f7f7e9', clouds);
  cloudMesh.castShadow = false;
  cloudMesh.receiveShadow = false;

  const textures = [];
  const landmarkLabels = [];
  function label(text, x, y, z, color = '#3f574b') {
    const surface = document.createElement('canvas');
    surface.width = 512;
    surface.height = 96;
    const ctx = surface.getContext('2d');
    ctx.fillStyle = 'rgba(255,253,239,.92)';
    ctx.beginPath();
    ctx.roundRect(5, 8, 502, 74, 37);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '600 48px "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 47);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }));
    sprite.position.set(x, y, z);
    sprite.scale.set(5.8, 1.09, 1);
    environment.add(sprite);
    landmarkLabels.push(sprite);
    return sprite;
  }

  const beacons = [];
  landmarks.forEach((landmark) => {
    const { x, z, kind } = landmark;
    const h = groundHeight(x, z);
    if (kind === 'camp') {
      // Canvas tent: triangular prism, open entry, bedroll and a cozy fire pit.
      const tent = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 3.2, 3), material('#dfa26d'));
      tent.rotation.set(Math.PI / 2, Math.PI, Math.PI / 2);
      tent.position.set(x - 3.6, h + 1.15, z + 1);
      tent.scale.set(1, 1.1, 0.85);
      tent.castShadow = true;
      environment.add(tent);
      colliders.push({ x: x - 3.6, z: z + 1, radius: 1.9 });
      const entry = mesh(new THREE.CircleGeometry(1.15, 3), '#7b725b', x - 3.6, h + 0.85, z + 2.78, [1.05, 1, 1]);
      entry.rotation.z = Math.PI / 2;
      mesh(cube, '#e8cba0', x - 3.6, h + 0.13, z + 3.5, [1.3, 0.16, 1.4]);
      mesh(cube, '#8f7957', x + 3.8, h + 0.52, z + 1.2, [2.8, 0.22, 0.65]);
      for (const side of [-1, 1]) mesh(cube, '#8f7957', x + 3.8 + side * 0.9, h + 0.25, z + 1.2, [0.22, 0.5, 0.55]);
      for (let i = 0; i < 8; i += 1) mesh(stone, '#a8aaa0', x + Math.cos(i * TAU / 8) * 0.7, h + 0.16, z + 1 + Math.sin(i * TAU / 8) * 0.7, [0.26, 0.2, 0.24]);
      const log = mesh(cylinder, '#907250', x, h + 0.22, z + 1, [0.16, 1.1, 0.16]);
      log.rotation.z = 1.2;
      mesh(cone, material('#efb469', { emissive: '#f8a255', emissiveIntensity: 0.25 }), x, h + 0.55, z + 1, [0.3, 0.75, 0.3]);
      label(landmark.name, x - 3.5, h + 4.5, z + 1);
    } else if (kind === 'tower') {
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) mesh(cube, '#9c8462', x + dx * 1.1, h + 2.6, z + dz * 1.1, [0.25, 5.2, 0.25]);
      mesh(cube, '#c5ac7d', x, h + 4, z, [3.1, 0.25, 3.1]);
      const roof = mesh(new THREE.ConeGeometry(2.65, 1.4, 4), '#7b9f91', x, h + 5.8, z);
      roof.rotation.y = Math.PI / 4;
      for (let i = 0; i < 8; i += 1) mesh(cube, '#bca27b', x, h + 0.5 + i * 0.43, z + 1.16, [0.95, 0.12, 0.2]);
      colliders.push({ x, z, radius: 1.5 });
      label(landmark.name, x, h + 7.8, z);
    } else if (kind === 'ruins') {
      const purpleStone = '#aaa3bc';
      for (const dx of [-3.1, 3.1]) {
        mesh(cube, purpleStone, x + dx, h + 2.6, z, [1.25, 5.2, 1.4]);
        mesh(cube, '#c4bdcf', x + dx, h + 5.05, z, [1.65, 0.4, 1.8]);
        colliders.push({ x: x + dx, z, radius: 0.9 });
      }
      mesh(cube, '#bcb5cb', x, h + 5.6, z, [7.5, 0.9, 1.65]);
      for (let i = 0; i < 5; i += 1) {
        const slab = mesh(cube, '#c0b9cc', x - 2 + i, h + 0.08, z + 3.5, [0.85, 0.13, 1.2]);
        slab.rotation.y = (i % 2 ? 1 : -1) * 0.1;
      }
      const crystal = mesh(new THREE.OctahedronGeometry(0.75), material('#b5b0e5', { emissive: '#8d7dba', emissiveIntensity: 0.3 }), x, h + 2.3, z);
      beacons.push(crystal);
      label(landmark.name, x, h + 7.5, z);
    } else {
      registerCanopy(mesh(cylinder, '#8e7b63', x, h + 1.8, z, [0.55, 3.6, 0.55]));
      registerCanopy(mesh(foliage, '#91b991', x, h + 5, z, [3.5, 3, 3.4]));
      registerCanopy(mesh(foliage, '#b8d1a0', x - 2.2, h + 4.4, z, [2.3, 2, 2.3]));
      registerCanopy(mesh(foliage, '#a4c695', x + 2, h + 4, z + 0.4, [2.4, 2.4, 2.3]));
      colliders.push({ x, z, radius: 0.95 });
      label(landmark.name, x, h + 9, z);
    }
  });

  const creatureTemplates = new Map();
  function worldCreature(config, scale) {
    const key = JSON.stringify({ ...config, name: '' });
    if (!creatureTemplates.has(key)) {
      const built = buildCreature(config, { lowDetail: true }).creature;
      built.updateMatrixWorld(true);
      const batches = new Map();
      built.traverse((object) => {
        if (!object.isMesh) return;
        const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
        for (const attribute of Object.keys(geometry.attributes)) {
          if (!['position', 'normal', 'uv'].includes(attribute)) geometry.deleteAttribute(attribute);
        }
        if (!batches.has(object.material)) batches.set(object.material, []);
        batches.get(object.material).push(geometry);
      });
      const template = new THREE.Group();
      for (const [sourceMaterial, geometries] of batches) {
        const merged = mergeGeometries(geometries, false);
        if (merged) {
          const part = new THREE.Mesh(merged, sourceMaterial.clone());
          part.castShadow = true;
          part.receiveShadow = true;
          template.add(part);
        }
        geometries.forEach((geometry) => geometry.dispose());
      }
      disposeTree(built);
      creatureTemplates.set(key, template);
    }
    const model = creatureTemplates.get(key).clone(true);
    model.scale.setScalar(scale);
    return model;
  }

  const initialPosition = safePosition(options.position || { x: 0, z: 26 });
  const position = new THREE.Vector3(initialPosition.x, 0, initialPosition.z);
  position.y = groundHeight(position.x, position.z);
  let partner = worldCreature(options.partner || {}, 0.47);
  scene.add(partner);
  let heading = Math.PI;
  const wild = new Map();
  const berryObjects = new Map();
  function addSpawn(spawn) {
    const group = new THREE.Group();
    const creature = worldCreature(spawn.config || {}, 0.39);
    group.add(creature);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.76, 0.82, 40), material('#f8efc5', { transparent: true, opacity: 0.55, side: THREE.DoubleSide }).clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), material('#fff0b9', { emissive: '#ffe2a1', emissiveIntensity: 0.35 }));
    marker.position.y = 2.18;
    group.add(marker);
    group.position.set(spawn.x, groundHeight(spawn.x, spawn.z), spawn.z);
    group.rotation.y = random() * TAU;
    scene.add(group);
    wild.set(spawn.id, { ...spawn, group, creature, marker, ring, phase: random() * TAU });
  }
  (options.spawns || []).forEach(addSpawn);
  (options.berries || []).forEach((berry) => {
    const group = new THREE.Group();
    mesh(foliage, '#78a66b', -0.25, 0.38, 0, [0.55, 0.5, 0.5], group);
    mesh(foliage, '#91b879', 0.28, 0.37, 0.1, [0.5, 0.45, 0.5], group);
    for (let i = 0; i < 4; i += 1) mesh(foliage, '#ce8191', Math.cos(i * 2.4) * 0.3, 0.66 + (i % 2) * 0.12, Math.sin(i * 2.4) * 0.22, [0.14, 0.16, 0.14], group);
    const sparkle = mesh(new THREE.OctahedronGeometry(0.12), material('#fff4bf', { emissive: '#fff4bf', emissiveIntensity: 0.2 }), 0, 1.35, 0, undefined, group);
    group.position.set(berry.x, groundHeight(berry.x, berry.z), berry.z);
    scene.add(group);
    berryObjects.set(berry.id, { ...berry, group, sparkle });
  });

  let active = true;
  let disposed = false;
  let contextLost = false;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let reportTimer = 1;
  let input = { x: 0, z: 0, run: false };
  let jumpHeight = 0;
  let jumpVelocity = 0;
  let cameraAngle = 0;
  let cameraDistance = 16;
  let cameraMode = 'follow';
  let drag = null;
  let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotionChange = (event) => { reducedMotion = event.matches; };
  motionPreference.addEventListener?.('change', onMotionChange);
  const cameraTarget = position.clone().add(new THREE.Vector3(0, 1.2, 0));
  const wantedCamera = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const viewDirection = new THREE.Vector3();
  const viewLine = new THREE.Line3();
  const canopyCenter = new THREE.Vector3();
  const closestPoint = new THREE.Vector3();
  let viewportWidth = 1;
  let viewportHeight = 1;
  camera.position.set(position.x, position.y + 10.5, position.z + 16);
  camera.lookAt(cameraTarget);

  function canWalk(x, z) {
    if (Math.abs(x) > WORLD_BOUNDS - 1 || Math.abs(z) > WORLD_BOUNDS - 1 || coast(x, z) > 0.93 || pondDistance(x, z) < 1.06) return false;
    return !colliders.some((item) => Math.hypot(x - item.x, z - item.z) < item.radius + 0.4);
  }
  function safePosition(next) {
    const x = Number.isFinite(Number(next.x)) ? clamp(Number(next.x), -WORLD_BOUNDS + 2, WORLD_BOUNDS - 2) : 0;
    const z = Number.isFinite(Number(next.z)) ? clamp(Number(next.z), -WORLD_BOUNDS + 2, WORLD_BOUNDS - 2) : 26;
    if (canWalk(x, z)) return { x, z };
    const alternatives = Array.from({ length: 24 }, (_, index) => ({ x: x + Math.sin(index * TAU / 24) * 3, z: z + Math.cos(index * TAU / 24) * 3 }));
    return alternatives.find((item) => canWalk(item.x, item.z)) || { x: 0, z: 26 };
  }
  function updateCanopyOcclusion(dt) {
    viewLine.set(camera.position, cameraTarget);
    const blocked = (x, y, z, radius) => {
      canopyCenter.set(x, y, z);
      viewLine.closestPointToPoint(canopyCenter, true, closestPoint);
      return closestPoint.distanceToSquared(canopyCenter) < (radius + 0.8) ** 2;
    };
    const blend = reducedMotion ? 1 : 1 - Math.exp(-dt * 12);
    occlusionInstances.forEach(({ object, entries, factors }) => {
      let changed = false;
      entries.forEach((entry, index) => {
        const { x, y, z, sx = 1, sy = sx, sz = sx, rotation = 0 } = entry;
        const radius = Math.max(sx, sy * (object.geometry === cone || object.geometry === cylinder ? 0.5 : 1), sz);
        const target = blocked(x, y, z, radius) ? 0.025 : 1;
        const previous = factors[index];
        const factor = Math.abs(previous - target) < 0.003 ? target : lerp(previous, target, blend);
        if (factor === previous) return;
        factors[index] = factor;
        transform.position.set(x, y, z);
        transform.rotation.set(0, rotation, 0);
        transform.scale.set(sx * factor, sy * factor, sz * factor);
        transform.updateMatrix();
        object.setMatrixAt(index, transform.matrix);
        changed = true;
      });
      if (changed) object.instanceMatrix.needsUpdate = true;
    });
    occlusionMeshes.forEach((item) => {
      const { object, scale } = item;
      const radius = Math.max(scale.x, scale.y * (object.geometry === cylinder ? 0.5 : 1), scale.z);
      const target = blocked(object.position.x, object.position.y, object.position.z, radius) ? 0.025 : 1;
      item.factor = Math.abs(item.factor - target) < 0.003 ? target : lerp(item.factor, target, blend);
      object.scale.copy(scale).multiplyScalar(item.factor);
    });
  }
  function regionAt(x, z) {
    let best = REGIONS[0]?.id || 'meadow';
    let score = Infinity;
    REGIONS.forEach((region) => {
      const distance = Math.hypot(x - region.x, z - region.z);
      if (distance < score) { score = distance; best = region.id; }
    });
    return best;
  }
  function snapshot(moving = false) {
    const candidates = [];
    wild.forEach((item) => candidates.push({ kind: 'wild', id: item.id, distance: Math.hypot(position.x - item.group.position.x, position.z - item.group.position.z), limit: 4.5 }));
    berryObjects.forEach((item) => candidates.push({ kind: 'berry', id: item.id, distance: Math.hypot(position.x - item.x, position.z - item.z), limit: 4 }));
    landmarks.forEach((item) => candidates.push({ kind: 'landmark', id: item.id, distance: Math.hypot(position.x - item.x, position.z - item.z), limit: Math.max(5, Number(item.radius) || 0) }));
    const nearest = candidates.filter((item) => item.distance < item.limit).sort((a, b) => a.distance - b.distance)[0];
    return { position: { x: position.x, z: position.z }, heading, regionId: regionAt(position.x, position.z), nearest: nearest ? { kind: nearest.kind, id: nearest.id, distance: nearest.distance } : null, moving };
  }
  function resize() {
    if (disposed) return;
    const bounds = container.getBoundingClientRect();
    const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    viewportWidth = width;
    viewportHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  function tick(now) {
    if (!active || disposed || contextLost) return;
    const dt = lastTime ? Math.min(0.045, (now - lastTime) / 1000) : 0;
    lastTime = now;
    elapsed += dt;
    const magnitude = Math.hypot(input.x, input.z);
    const moving = magnitude > 0.01;
    if (moving) {
      const speed = input.run ? 8 : 4.5;
      const dx = input.x / Math.max(1, magnitude) * speed * dt;
      const dz = input.z / Math.max(1, magnitude) * speed * dt;
      if (canWalk(position.x + dx, position.z)) position.x += dx;
      if (canWalk(position.x, position.z + dz)) position.z += dz;
      heading = Math.atan2(input.x, input.z);
    }
    position.y = groundHeight(position.x, position.z);
    if (jumpVelocity !== 0 || jumpHeight > 0) {
      jumpVelocity -= dt * 15;
      jumpHeight = Math.max(0, jumpHeight + jumpVelocity * dt);
      if (jumpHeight === 0) jumpVelocity = 0;
    }
    const bob = reducedMotion ? 0 : moving ? Math.abs(Math.sin(elapsed * (input.run ? 14 : 10))) * 0.09 : Math.sin(elapsed * 1.8) * 0.014;
    partner.position.copy(position);
    partner.position.y += jumpHeight + bob;
    const turnDifference = Math.atan2(Math.sin(heading - partner.rotation.y), Math.cos(heading - partner.rotation.y));
    partner.rotation.y += turnDifference * Math.min(1, dt * 12);
    partner.rotation.z = moving && !reducedMotion ? Math.sin(elapsed * 10) * 0.035 : 0;

    wild.forEach((item) => {
      if (!reducedMotion) {
        const wave = elapsed * 0.24 + item.phase;
        const nx = item.x + Math.sin(wave) * 0.65;
        const nz = item.z + Math.cos(wave * 0.8) * 0.45;
        item.group.position.set(nx, groundHeight(nx, nz), nz);
        item.creature.position.y = Math.sin(elapsed * 2 + item.phase) * 0.045;
        item.marker.position.y = 2.15 + Math.sin(elapsed * 2.6 + item.phase) * 0.1;
        item.marker.rotation.y = elapsed;
        if (Math.hypot(position.x - nx, position.z - nz) < 9) item.group.rotation.y = Math.atan2(position.x - nx, position.z - nz);
      }
      item.ring.material.opacity = Math.hypot(position.x - item.group.position.x, position.z - item.group.position.z) < 4.5 ? 0.95 : 0.4;
    });
    berryObjects.forEach((item) => { if (!reducedMotion) item.sparkle.rotation.y = elapsed; });
    ripples.forEach((ring) => { if (!reducedMotion) ring.scale.setScalar(1 + Math.sin(elapsed * 0.8 + ring.userData.phase) * 0.18); });
    beacons.forEach((crystal) => { if (!reducedMotion) crystal.rotation.y = elapsed * 0.45; });
    const cameraHeight = cameraMode === 'overview' ? 26 : 10.5;
    const cameraLength = cameraMode === 'overview' ? 20 : cameraDistance;
    wantedCamera.set(position.x + Math.sin(cameraAngle) * cameraLength, position.y + cameraHeight, position.z + Math.cos(cameraAngle) * cameraLength);
    const cameraBlend = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    camera.position.lerp(wantedCamera, cameraBlend);
    lookTarget.set(position.x, position.y + 1, position.z);
    cameraTarget.lerp(lookTarget, cameraBlend);
    camera.lookAt(cameraTarget);
    updateCanopyOcclusion(dt || 1 / 60);
    camera.getWorldDirection(viewDirection);
    landmarkLabels.forEach((sprite) => {
      const distance = Math.max(0.5, (sprite.position.x - camera.position.x) * viewDirection.x + (sprite.position.y - camera.position.y) * viewDirection.y + (sprite.position.z - camera.position.z) * viewDirection.z);
      const worldPerPixel = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance / viewportHeight;
      const worldWidth = Math.min(5.8, clamp(viewportWidth * 0.18, 124, 148) * worldPerPixel);
      sprite.scale.set(worldWidth, worldWidth * 96 / 512, 1);
    });
    sun.position.set(position.x - 18, 32, position.z + 16);
    sun.target.position.set(position.x, 0, position.z);
    reportTimer += dt;
    if (reportTimer >= 0.1) { reportTimer = 0; options.onUpdate?.(snapshot(moving)); }
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }

  function onPointerDown(event) {
    if (event.button !== 0 || !active) return;
    drag = { x: event.clientX, y: event.clientY, moved: false };
    canvas.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event) {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    cameraAngle -= dx * 0.006;
    cameraDistance = clamp(cameraDistance + dy * 0.03, 9, 25);
    drag.x = event.clientX;
    drag.y = event.clientY;
  }
  function onPointerUp(event) {
    drag = null;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  function onWheel(event) {
    event.preventDefault();
    cameraDistance = clamp(cameraDistance + event.deltaY * 0.012, 9, 25);
  }
  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
  }
  function onContextRestored() {
    contextLost = false;
    lastTime = 0;
    if (active && !disposed) frame = requestAnimationFrame(tick);
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  frame = requestAnimationFrame(tick);

  return {
    setActive(enabled) {
      const next = Boolean(enabled);
      if (disposed || next === active) return;
      active = next;
      input = { x: 0, z: 0, run: false };
      drag = null;
      cancelAnimationFrame(frame);
      if (active && !contextLost) { lastTime = 0; reportTimer = 1; resize(); frame = requestAnimationFrame(tick); }
    },
    setPartner(config) {
      if (disposed) return;
      const next = worldCreature(config, 0.47);
      next.position.copy(partner.position);
      next.rotation.copy(partner.rotation);
      scene.remove(partner);
      partner = next;
      scene.add(partner);
    },
    setSpawns(spawns) {
      const nextIds = new Set(spawns.map((item) => item.id));
      wild.forEach((item, id) => { if (!nextIds.has(id)) this.removeSpawn(id); });
      spawns.forEach((spawn) => {
        const existing = wild.get(spawn.id);
        if (existing && (JSON.stringify(existing.config) !== JSON.stringify(spawn.config) || existing.x !== spawn.x || existing.z !== spawn.z)) this.removeSpawn(spawn.id);
        if (!wild.has(spawn.id)) addSpawn(spawn);
      });
      reportTimer = 1;
    },
    removeSpawn(id) {
      const item = wild.get(id);
      if (!item) return;
      scene.remove(item.group);
      item.ring.geometry.dispose();
      item.ring.material.dispose();
      item.marker.geometry.dispose();
      wild.delete(id);
      reportTimer = 1;
    },
    removeBerry(id) {
      const item = berryObjects.get(id);
      if (!item) return;
      scene.remove(item.group);
      item.sparkle.geometry.dispose();
      berryObjects.delete(id);
      reportTimer = 1;
    },
    setPosition(next) {
      const x = Number(next.x), z = Number(next.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      // Saved positions and teleports share the same ground/collision validation.
      const candidate = safePosition({ x, z });
      position.set(candidate.x, groundHeight(candidate.x, candidate.z), candidate.z);
      jumpHeight = jumpVelocity = 0;
      camera.position.set(position.x + Math.sin(cameraAngle) * cameraDistance, position.y + 10.5, position.z + Math.cos(cameraAngle) * cameraDistance);
      cameraTarget.set(position.x, position.y + 1, position.z);
      reportTimer = 1;
    },
    setInput(next) { input = { x: clamp(Number(next.x) || 0, -1, 1), z: clamp(Number(next.z) || 0, -1, 1), run: Boolean(next.run) }; },
    jump() { if (active && jumpHeight === 0) jumpVelocity = 5.7; },
    setCameraMode(mode) { cameraMode = mode; },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      motionPreference.removeEventListener?.('change', onMotionChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      disposeTree(scene);
      creatureTemplates.forEach((template) => disposeTree(template));
      materials.forEach((entry) => entry.dispose());
      textures.forEach((texture) => texture.dispose());
      sun.shadow.map?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
