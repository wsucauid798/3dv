import * as THREE from "three";

export type ModelMetadata = {
  dimensions: {
    x: number;
    y: number;
    z: number;
  };
  fileSizeBytes: number;
  triangleCount: number;
  vertexCount: number;
};

export function extractModelMetadata(
  model: THREE.Object3D,
  fileSizeBytes: number
): ModelMetadata {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  let triangleCount = 0;
  let vertexCount = 0;

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const geometry = child.geometry;
    const position = geometry.getAttribute("position");

    if (!position) {
      return;
    }

    vertexCount += position.count;
    triangleCount += geometry.index
      ? geometry.index.count / 3
      : position.count / 3;
  });

  return {
    dimensions: {
      x: size.x,
      y: size.y,
      z: size.z
    },
    fileSizeBytes,
    triangleCount: Math.round(triangleCount),
    vertexCount
  };
}
