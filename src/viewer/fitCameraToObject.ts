import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  renderer: THREE.WebGLRenderer,
  direction = new THREE.Vector3(1, 0.75, 1).normalize()
) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);

  if (!Number.isFinite(maxSize) || maxSize === 0) {
    return;
  }

  const fitHeightDistance =
    maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.45;
  camera.position
    .copy(center)
    .add(direction.clone().normalize().multiplyScalar(distance));
  camera.near = Math.max(distance / 1000, 0.001);
  camera.far = distance * 1000;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
  renderer.renderLists.dispose();
}
