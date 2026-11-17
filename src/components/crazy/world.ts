import * as THREE from "three";

/** Lightweight voxel arena. A single instanced draw is used per material. */
export function createCrazyWorld(scene: THREE.Scene) {
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const stone = ["#4c3848", "#614051", "#78515a", "#3a2b3a"].map(color => new THREE.MeshLambertMaterial({ color }));
  const magma = new THREE.MeshBasicMaterial({ color: "#ff5710" });
  const hot = new THREE.MeshBasicMaterial({ color: "#ffb022" });
  const velvet = new THREE.MeshLambertMaterial({ color: "#a31c16", side: THREE.DoubleSide });
  const entries: Array<{ x: number; y: number; z: number }> [] = [[], [], [], [], [], [], []];
  const put = (kind: number, x: number, y: number, z: number) => entries[kind]!.push({ x, y, z });
  for (let x = -8; x < 8; x++) for (let z = -8; z < 8; z++) {
    const index = Math.abs((x * 13 + z * 7)) % 4;
    put((x * 11 + z * 7) % 23 === 0 ? 4 : index, x, -0.5, z);
    if (x === -8 || x === 7 || z === -8 || z === 7) {
      for (let y = 0; y < 16; y++) {
        if (y > 8 && (x + z) % 3 !== 0) continue; // open top, solid collision still handled server-side
        put(y > 8 ? 4 : Math.abs((x + y * 3 + z * 5)) % 4, x, y + 0.5, z);
      }
    }
  }
  // Glowing floor paths and crenellation details.
  for (let i = -6; i <= 6; i++) { if (i % 3 === 0) { put(4, i, -0.49, -2); put(4, -2, -0.49, i); } }
  for (const x of [-5, 0, 5]) { put(5, x, 3.5, -6.98); put(5, x, 3.5, 6.98); }
  const group = new THREE.Group();
  const mats: THREE.Material[] = [...stone, magma, hot, velvet];
  const instanced: THREE.InstancedMesh[] = [];
  const temp = new THREE.Object3D();
  entries.forEach((positions, idx) => {
    if (!positions.length) return;
    const mesh = new THREE.InstancedMesh(cube, mats[idx]!, positions.length);
    positions.forEach(({ x, y, z }, i) => {
      temp.position.set(x, y, z);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh); instanced.push(mesh);
  });
  // Large banners and torches are individual low-poly details.
  const panel = new THREE.BoxGeometry(1, 1, 1);
  function decor(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) {
    const mesh = new THREE.Mesh(panel, mat);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); group.add(mesh);
  }
  for (const x of [-5, 0, 5]) {
    for (const z of [-7.42, 7.42]) {
      decor(x, 4.1, z, 1.65, 2.8, 0.12, velvet);
      decor(x, 4.15, z + (z < 0 ? 0.11 : -0.11), 0.45, 0.85, 0.05, hot);
    }
    decor(x, 2.8, -7.0, 0.32, 0.48, 0.38, hot);
    decor(x, 2.8, 7.0, 0.32, 0.48, 0.38, hot);
  }
  scene.add(group);
  scene.background = new THREE.Color("#38214a");
  scene.fog = new THREE.Fog("#38214a", 15, 34);
  scene.add(new THREE.HemisphereLight("#f8c8ee", "#462008", 2.25));
  const light = new THREE.PointLight("#ff741b", 90, 22);
  light.position.set(0, 5, 0); scene.add(light);
  return () => {
    scene.remove(group);
    group.clear();
    for (const mesh of instanced) mesh.dispose();
    cube.dispose(); panel.dispose();
    for (const material of mats) material.dispose();
  };
}
