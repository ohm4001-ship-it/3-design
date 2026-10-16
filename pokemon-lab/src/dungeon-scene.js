import * as THREE from 'three';
import { buildCreature, disposeTree } from './scene.js';

const ROOM_CENTERS = [24, 0, -24];
const clamp = THREE.MathUtils.clamp;
const TAU = Math.PI * 2;

/** The dungeon is a local diorama: all encounters and rewards are owned by the UI/rules. */
export function createDungeonScene(container, options = {}) {
  const dungeon = options.dungeon || {};
  const scene = new THREE.Scene();
  const backdrop = new THREE.Color(dungeon.background || '#151d32');
  scene.background = backdrop;
  scene.fog = new THREE.Fog(backdrop, 40, 92);
  const camera = new THREE.OrthographicCamera(-15, 15, 12, -12, 0.1, 160);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '3D 던전. WASD 또는 방향키로 이동하고 E로 수호자나 문과 상호작용하세요.');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
  container.appendChild(canvas);

  const environment = new THREE.Group();
  const actors = new THREE.Group();
  scene.add(environment, actors);
  scene.add(new THREE.HemisphereLight('#e7eaff', '#272c42', 2.1));
  const moon = new THREE.DirectionalLight('#e1eaff', 3.2);
  moon.position.set(-12, 23, 13);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 0.1, far: 70 });
  moon.shadow.normalBias = 0.06;
  moon.shadow.bias = -0.0002;
  scene.add(moon, moon.target);
  const rim = new THREE.DirectionalLight(dungeon.accent || '#a8e4ec', 1.3);
  rim.position.set(12, 10, -18);
  scene.add(rim);

  const color = dungeon.color || '#9483c4';
  const accent = dungeon.accent || '#89e5d4';
  const floorColor = dungeon.floorColor || '#59627d';
  const wallColor = dungeon.wallColor || '#78829b';
  const palette = new Map();
  const material = (hex, extra = {}) => {
    const key = `${hex}-${JSON.stringify(extra)}`;
    if (!palette.has(key)) palette.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, flatShading: true, ...extra }));
    return palette.get(key);
  };
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const crystalGeometry = new THREE.OctahedronGeometry(1, 0);
  const sphere = new THREE.IcosahedronGeometry(1, 1);
  const dummy = new THREE.Object3D();
  const crystals = [];
  const flames = [];
  const gates = [];
  const chests = [];
  const runeGroups = [];
  const roomGroups = [];

  function mesh(geometry, shade, position, scale, parent = environment) {
    const object = new THREE.Mesh(geometry, typeof shade === 'string' ? material(shade) : shade);
    object.position.set(...position);
    if (scale) object.scale.set(...scale);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function ring(radius, thickness, shade, x, y, z, parent = environment) {
    const result = mesh(new THREE.RingGeometry(radius - thickness, radius, 48), shade, [x, y, z], null, parent);
    result.rotation.x = -Math.PI / 2;
    result.castShadow = false;
    return result;
  }

  function instances(geometry, shade, transforms, parent = environment) {
    const result = new THREE.InstancedMesh(geometry, typeof shade === 'string' ? material(shade) : shade, transforms.length);
    for (const [index, item] of transforms.entries()) {
      dummy.position.set(...item.position);
      dummy.rotation.set(0, item.angle || 0, 0);
      dummy.scale.set(...(item.scale || [1, 1, 1]));
      dummy.updateMatrix();
      result.setMatrixAt(index, dummy.matrix);
    }
    result.castShadow = true;
    result.receiveShadow = true;
    parent.add(result);
    return result;
  }

  const glowMaterial = material(accent, { emissive: accent, emissiveIntensity: 0.8, roughness: 0.25 });
  const goldMaterial = material('#e6bd78', { metalness: 0.55, roughness: 0.35 });
  const runeMaterial = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const floorShades = [floorColor, new THREE.Color(floorColor).multiplyScalar(1.08).getStyle(), new THREE.Color(floorColor).multiplyScalar(0.94).getStyle()];

  for (let index = 0; index < ROOM_CENTERS.length; index += 1) {
    const center = ROOM_CENTERS[index];
    const room = new THREE.Group();
    environment.add(room);
    roomGroups.push(room);

    // Floating stone foundations and shallow cutaway walls keep the player visible.
    mesh(cube, material(floorColor, { roughness: 1 }), [0, -0.68, center], [18.6, 1.2, 18.6], room);
    mesh(cube, '#303b55', [0, -1.4, center], [17.8, 0.4, 17.8], room);
    const floorTiles = [[], [], []];
    for (let x = -7.5; x <= 7.5; x += 3) {
      for (let z = -7.5; z <= 7.5; z += 3) {
        floorTiles[Math.abs(Math.round((x + z) / 3 + index)) % 3].push({ position: [x, -0.015, center + z], scale: [2.94, 0.16, 2.94] });
      }
    }
    floorTiles.forEach((tiles, shade) => instances(cube, floorShades[shade], tiles, room));
    const blocks = [];
    for (let n = -8; n <= 8; n += 2) {
      blocks.push({ position: [-9, 0.4, center + n], scale: [0.6, 0.8, 1.94] });
      blocks.push({ position: [9, 0.4, center + n], scale: [0.6, 0.8, 1.94] });
      if (Math.abs(n) > 2) {
        blocks.push({ position: [n, 0.4, center - 9], scale: [1.94, 0.8, 0.6] });
        blocks.push({ position: [n, 0.18, center + 9], scale: [1.94, 0.36, 0.6] });
      }
    }
    instances(cube, wallColor, blocks, room);

    // Tall decoration stays behind the arena; the near edge is deliberately open.
    for (const side of [-1, 1]) {
      mesh(cube, wallColor, [side * 7.7, 1.3, center - 7.7], [1, 2.6, 1], room);
      mesh(cube, goldMaterial, [side * 7.7, 2.64, center - 7.7], [1.25, 0.22, 1.25], room);
      mesh(cube, '#39485c', [side * 7.7, 0.15, center - 7.7], [1.4, 0.3, 1.4], room);
      const flame = mesh(sphere, glowMaterial, [side * 7.7, 3.06, center - 7.7], [0.27, 0.56, 0.27], room);
      flames.push({ mesh: flame, base: 3.06, phase: index + side });
      for (let shard = 0; shard < 3; shard += 1) {
        const crystal = mesh(crystalGeometry, material(color, { emissive: color, emissiveIntensity: 0.45, roughness: 0.35 }), [side * (7.4 + shard * 0.33), 0.7 - shard * 0.12, center + 4.7 + shard * 0.36], [0.3, 0.8 - shard * 0.14, 0.3], room);
        crystal.rotation.z = side * (0.08 + shard * 0.18);
        crystals.push({ mesh: crystal, y: crystal.position.y, phase: index + shard });
      }
    }

    const rune = new THREE.Group();
    rune.position.set(0, 0.08, center - 2);
    room.add(rune);
    ring(2.45, 0.045, runeMaterial, 0, 0, 0, rune);
    ring(1.92, 0.018, runeMaterial, 0, 0.004, 0, rune);
    for (let mark = 0; mark < 12; mark += 1) {
      const angle = mark / 12 * TAU;
      const runeMark = mesh(cube, glowMaterial, [Math.sin(angle) * 2.2, 0.005, Math.cos(angle) * 2.2], [0.055, 0.025, mark % 3 === 0 ? 0.27 : 0.12], rune);
      runeMark.rotation.y = angle;
    }
    runeGroups.push(rune);

    const gate = new THREE.Group();
    gate.position.set(0, 0, center - 8.2);
    room.add(gate);
    for (const side of [-1, 1]) {
      mesh(cube, wallColor, [side * 2.25, 1.65, 0], [0.8, 3.3, 0.85], gate);
      mesh(cube, goldMaterial, [side * 2.25, 0.45, 0], [0.94, 0.16, 0.96], gate);
      mesh(cube, glowMaterial, [side * 2.25, 2.6, 0.46], [0.19, 0.34, 0.08], gate);
    }
    mesh(cube, wallColor, [0, 3.45, 0], [5.4, 0.5, 0.9], gate);
    mesh(crystalGeometry, goldMaterial, [0, 3.72, 0], [0.28, 0.4, 0.26], gate);
    const barrierMaterial = new THREE.MeshBasicMaterial({ color: '#cd8a9a', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    const barrier = mesh(new THREE.PlaneGeometry(3.65, 2.9), barrierMaterial, [0, 1.53, 0], null, gate);
    barrier.castShadow = false;
    const bars = [];
    for (let bar = -1.5; bar <= 1.5; bar += 0.75) {
      bars.push(mesh(cube, '#d0a3ad', [bar, 1.5, 0.07], [0.045, 2.75, 0.045], gate));
    }
    gates.push({ group: gate, barrier, bars, material: barrierMaterial });

    // A little shrine and treasure chest make each room legible at a glance.
    mesh(cylinder, wallColor, [-5.5, 0.25, center + 0.8], [0.9, 0.5, 0.9], room);
    mesh(cylinder, goldMaterial, [-5.5, 0.52, center + 0.8], [0.74, 0.09, 0.74], room);
    const relic = mesh(crystalGeometry, glowMaterial, [-5.5, 1.35, center + 0.8], [0.38, 0.65, 0.38], room);
    crystals.push({ mesh: relic, y: 1.35, phase: index + 3 });
    ring(1.2, 0.035, runeMaterial, -5.5, 0.075, center + 0.8, room);
    const chest = new THREE.Group();
    chest.position.set(5.4, 0, center + 0.8);
    room.add(chest);
    mesh(cube, '#4a4055', [0, 0.42, 0], [1.3, 0.75, 0.95], chest);
    const lid = mesh(cube, color, [0, 0.88, 0], [1.38, 0.24, 1], chest);
    mesh(cube, goldMaterial, [0, 0.62, 0.51], [0.28, 0.4, 0.055], chest);
    for (const side of [-1, 1]) mesh(cube, goldMaterial, [side * 0.46, 0.48, 0], [0.08, 0.83, 1.02], chest);
    chests.push({ group: chest, lid });

    if (index < ROOM_CENTERS.length - 1) {
      mesh(cube, '#3c4964', [0, -0.35, center - 12], [5.3, 0.6, 6.1], environment);
      for (const side of [-1, 1]) mesh(cube, wallColor, [side * 2.6, 0.18, center - 12], [0.18, 0.36, 6.1], environment);
      for (let dash = 0; dash < 3; dash += 1) mesh(cube, glowMaterial, [0, 0.015, center - 10 - dash * 2], [0.16, 0.035, 0.5], environment);
    }
  }

  // Entrance light is also the visible retreat point for the first room.
  const entranceRing = ring(1.3, 0.06, runeMaterial, 0, 0.09, 31);
  ring(0.96, 0.025, runeMaterial, 0, 0.095, 31);
  for (const side of [-1, 1]) mesh(crystalGeometry, glowMaterial, [side * 1.7, 0.45, 31], [0.18, 0.45, 0.18]);

  const starPositions = [];
  for (let i = 0; i < 150; i += 1) {
    starPositions.push(Math.sin(i * 47.13) * 26, 0.3 + ((i * 17) % 53) / 11, -36 + ((i * 37) % 760) / 10);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const motes = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: accent, size: 0.055, transparent: true, opacity: 0.65, depthWrite: false }));
  scene.add(motes);

  let player = null;
  let enemy = null;
  let partnerSignature = '';
  let enemySignature = '';
  let runState = { roomIndex: 0, roomCleared: [] };
  let roomIndex = 0;
  let enemyAlive = true;
  const position = new THREE.Vector3(0, 0, 30);
  const input = { x: 0, z: 0, run: false };
  let heading = Math.PI;
  let jumping = 0;
  let jumpVelocity = 0;
  let active = false;
  let disposed = false;
  let contextLost = false;
  let animationId = 0;
  let lastTime = 0;
  let elapsed = 0;
  let lastUpdate = -1;
  let pulseTime = 0;
  let pulseKind = '';
  const cameraTarget = new THREE.Vector3(0, 0.5, 24);
  const wantedTarget = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3(10, 19, 21);

  const pulseMaterial = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const pulseRing = ring(1, 0.08, pulseMaterial, 0, 0.13, 0, actors);
  pulseRing.visible = false;
  const playerMarker = ring(0.7, 0.05, new THREE.MeshBasicMaterial({ color: '#c5fff2', transparent: true, opacity: 0.75, side: THREE.DoubleSide }), 0, 0.12, 30, actors);

  function replaceActor(previous, config, scale) {
    if (previous) {
      actors.remove(previous);
      disposeTree(previous);
    }
    const result = buildCreature(config || {}, { lowDetail: true }).creature;
    result.scale.setScalar(scale);
    actors.add(result);
    return result;
  }

  function setPartner(next) {
    const config = next?.config || next || {};
    const signature = JSON.stringify(config);
    if (signature === partnerSignature) return;
    partnerSignature = signature;
    player = replaceActor(player, config, 0.52);
    player.position.copy(position);
    player.rotation.y = heading;
  }

  function roomCleared(index = roomIndex) {
    const entries = runState.roomCleared || [];
    return entries.includes(index) || entries.includes(dungeon.rooms?.[index]?.id);
  }

  function syncEnemy() {
    const definition = runState.battle?.enemy || dungeon.rooms?.[roomIndex]?.enemy || dungeon.guardian || {};
    const config = definition.config || definition;
    const signature = `${roomIndex}-${JSON.stringify(config)}`;
    if (signature !== enemySignature) {
      enemySignature = signature;
      enemy = replaceActor(enemy, config, roomIndex === 2 ? 0.85 : 0.66);
    }
    enemy.position.set(0, 0, ROOM_CENTERS[roomIndex] - 2);
    enemy.rotation.y = 0;
    enemyAlive = !roomCleared() && !(Number.isFinite(runState.battle?.enemyHp) && runState.battle.enemyHp <= 0);
    enemy.visible = enemyAlive;
  }

  function nearestInteraction() {
    const center = ROOM_CENTERS[roomIndex];
    const enemyDistance = Math.hypot(position.x, position.z - (center - 2));
    if (enemyAlive && enemyDistance <= 4) return { kind: 'enemy', id: dungeon.rooms?.[roomIndex]?.id || `room-${roomIndex}`, distance: enemyDistance };
    const gateDistance = Math.hypot(position.x, position.z - (center - 7));
    if (roomCleared() && gateDistance <= 3) return { kind: 'gate', id: `gate-${roomIndex}`, distance: gateDistance };
    const exitDistance = Math.hypot(position.x, position.z - 31);
    if (roomIndex === 0 && exitDistance <= 2.6) return { kind: 'exit', id: 'entrance', distance: exitDistance };
    return null;
  }

  function snapshot() {
    return { position: { x: position.x, z: position.z }, heading, roomIndex, nearest: nearestInteraction(), moving: Math.hypot(input.x, input.z) > 0 };
  }

  function resize() {
    if (disposed) return;
    const width = Math.max(container.clientWidth || 320, 1);
    const height = Math.max(container.clientHeight || 400, 1);
    const aspect = width / height;
    // Keep a useful arena width on mobile while still showing the whole room on desktop.
    const halfHeight = aspect < 0.8 ? 12.8 / aspect : 13.4;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function updateCamera(immediate = false, dt = 0.016) {
    const center = ROOM_CENTERS[roomIndex];
    wantedTarget.set(position.x * 0.18, 0.4, center + (position.z - center) * 0.18);
    cameraTarget.lerp(wantedTarget, immediate ? 1 : 1 - Math.exp(-5 * dt));
    camera.position.copy(cameraTarget).add(cameraOffset);
    camera.lookAt(cameraTarget);
    moon.position.set(-12, 23, center + 13);
    moon.target.position.set(0, 0, center);
  }

  function animate(now) {
    if (!active || disposed || contextLost) return;
    const dt = Math.min((now - (lastTime || now)) / 1000, 0.05);
    lastTime = now;
    elapsed += dt;
    const length = Math.hypot(input.x, input.z);
    const moving = length > 0.04;
    if (moving) {
      const speed = input.run ? 7 : 4.2;
      const stepX = input.x / Math.max(length, 1) * speed * dt;
      const stepZ = input.z / Math.max(length, 1) * speed * dt;
      position.x = clamp(position.x + stepX, -8, 8);
      position.z = clamp(position.z + stepZ, ROOM_CENTERS[roomIndex] - 8, ROOM_CENTERS[roomIndex] + 8);
      heading = Math.atan2(input.x, input.z);
    }
    if (jumping > 0 || jumpVelocity > 0) {
      jumpVelocity -= 15 * dt;
      jumping = Math.max(0, jumping + jumpVelocity * dt);
      if (jumping === 0) jumpVelocity = 0;
    }
    if (player) {
      player.position.set(position.x, jumping + (moving ? Math.abs(Math.sin(elapsed * (input.run ? 15 : 10))) * 0.09 : Math.sin(elapsed * 2) * 0.018), position.z);
      const angle = THREE.MathUtils.euclideanModulo(heading - player.rotation.y + Math.PI, TAU) - Math.PI;
      player.rotation.y += angle * Math.min(dt * 12, 1);
      player.rotation.z = moving ? Math.sin(elapsed * 10) * 0.045 : 0;
    }
    playerMarker.position.set(position.x, 0.12, position.z);
    playerMarker.material.opacity = 0.6 + Math.sin(elapsed * 3) * 0.1;
    if (enemy?.visible) {
      enemy.position.y = Math.sin(elapsed * 2.3) * 0.05;
      enemy.rotation.y = Math.sin(elapsed * 0.6) * 0.16;
    }
    for (const item of crystals) {
      item.mesh.position.y = item.y + Math.sin(elapsed * 1.7 + item.phase) * 0.06;
      item.mesh.rotation.y = elapsed * 0.3 + item.phase;
    }
    for (const item of flames) {
      item.mesh.position.y = item.base + Math.sin(elapsed * 5 + item.phase) * 0.035;
      item.mesh.scale.y = 0.5 + Math.sin(elapsed * 7 + item.phase) * 0.065;
    }
    for (const [index, gate] of gates.entries()) {
      gate.material.opacity = (roomCleared(index) ? 0.2 : 0.12) + Math.sin(elapsed * 2 + index) * 0.04;
    }
    entranceRing.material.opacity = 0.45 + Math.sin(elapsed * 2) * 0.12;
    motes.position.y = Math.sin(elapsed * 0.4) * 0.15;
    if (pulseTime > 0) {
      pulseTime = Math.max(0, pulseTime - dt);
      const fraction = 1 - pulseTime / 0.65;
      pulseRing.visible = pulseTime > 0;
      pulseRing.scale.setScalar(0.5 + fraction * (pulseKind === 'clear' ? 7 : 3));
      pulseMaterial.opacity = (1 - fraction) * 0.85;
      if (pulseKind === 'damage' && player) player.position.x += Math.sin(fraction * 35) * 0.09 * (1 - fraction);
    }
    updateCamera(false, dt);
    if (elapsed - lastUpdate >= 0.1) {
      lastUpdate = elapsed;
      options.onUpdate?.(snapshot());
    }
    renderer.render(scene, camera);
    animationId = requestAnimationFrame(animate);
  }

  function interact(event) {
    if (active && !disposed) {
      event.preventDefault();
      options.onInteract?.(snapshot().nearest);
    }
  }
  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(animationId);
  }
  function onContextRestored() {
    contextLost = false;
    if (active && !disposed) {
      lastTime = 0;
      animationId = requestAnimationFrame(animate);
    }
  }
  canvas.addEventListener('dblclick', interact);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  setPartner(options.partner);
  syncEnemy();
  resize();
  updateCamera(true);
  renderer.render(scene, camera);

  return {
    setActive(enabled) {
      const next = Boolean(enabled);
      if (disposed || next === active) return;
      active = next;
      input.x = 0;
      input.z = 0;
      input.run = false;
      cancelAnimationFrame(animationId);
      lastTime = 0;
      if (active && !contextLost) {
        resize();
        lastUpdate = -1;
        animationId = requestAnimationFrame(animate);
      }
    },
    setInput(next = {}) {
      if (disposed) return;
      input.x = Number.isFinite(next.x) ? clamp(next.x, -1, 1) : 0;
      input.z = Number.isFinite(next.z) ? clamp(next.z, -1, 1) : 0;
      input.run = Boolean(next.run);
    },
    jump() {
      if (active && jumping === 0) jumpVelocity = 5.3;
    },
    setRunState(next) {
      if (disposed || !next) return;
      runState = next;
      const nextRoom = clamp(Number.isInteger(next.roomIndex) ? next.roomIndex : 0, 0, 2);
      if (nextRoom !== roomIndex) {
        roomIndex = nextRoom;
        position.set(0, 0, ROOM_CENTERS[roomIndex] + 6);
        heading = Math.PI;
        input.x = 0;
        input.z = 0;
        jumping = 0;
        jumpVelocity = 0;
        updateCamera(true);
      }
      if (next.partner) setPartner(next.partner);
      syncEnemy();
      gates.forEach((gate, index) => {
        const cleared = roomCleared(index);
        gate.material.color.set(cleared ? accent : '#cd8a9a');
        gate.bars.forEach((bar) => { bar.visible = !cleared; });
        chests[index].lid.rotation.x = cleared ? -0.75 : 0;
        chests[index].lid.position.set(0, cleared ? 1.08 : 0.88, cleared ? -0.25 : 0);
      });
      options.onUpdate?.(snapshot());
      if (!active) renderer.render(scene, camera);
    },
    pulse(kind = 'attack') {
      if (disposed) return;
      pulseKind = kind;
      pulseTime = 0.65;
      const target = kind === 'attack' && enemy ? enemy.position : position;
      pulseRing.position.set(target.x, 0.15, target.z);
      pulseMaterial.color.set(kind === 'damage' ? '#f0a3a3' : kind === 'clear' ? '#ffe2a2' : accent);
      pulseRing.visible = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active = false;
      cancelAnimationFrame(animationId);
      observer.disconnect();
      canvas.removeEventListener('dblclick', interact);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      disposeTree(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
