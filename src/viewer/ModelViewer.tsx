import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import { readFile, readTextFile } from "@tauri-apps/plugin-fs";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { fitCameraToObject } from "./fitCameraToObject";
import { extractModelMetadata, type ModelMetadata } from "./modelMetadata";

type ModelViewerProps = {
  onLoadStateChange: (state: ViewerLoadState) => void;
  path: string | null;
  wireframe: boolean;
};

export type ModelViewerHandle = {
  fitToView: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
};

export type CameraPreset = "front" | "side" | "top" | "isometric";

const cameraPresetDirections: Record<CameraPreset, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1),
  side: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 1, 0),
  isometric: new THREE.Vector3(1, 0.75, 1)
};

export type ViewerLoadState =
  | {
      kind: "idle";
    }
  | {
      kind: "loading";
    }
  | {
      kind: "loaded";
      metadata: ModelMetadata;
    }
  | {
      kind: "failed";
      message: string;
    };

function extensionFromPath(path: string) {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function isSamplePath(path: string) {
  return path.startsWith("sample://");
}

function isLocalRelativeUri(uri: string) {
  if (
    uri.startsWith("data:") ||
    uri.startsWith("blob:") ||
    /^[a-z]+:\/\//i.test(uri) ||
    uri.startsWith("/") ||
    uri.startsWith("\\") ||
    /^[a-z]:[\\/]/i.test(uri)
  ) {
    return false;
  }

  return true;
}

function directoryFromPath(path: string) {
  const lastSeparator = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return lastSeparator < 0 ? "" : path.slice(0, lastSeparator);
}

function resolvePath(baseDir: string, relativePath: string) {
  if (!baseDir) {
    return relativePath;
  }

  const separator = baseDir.includes("\\") ? "\\" : "/";
  const baseParts = baseDir.split(/[\\/]+/);
  const resolvedParts = [...baseParts];

  for (const part of relativePath.split(/[\\/]+/)) {
    if (part === "" || part === ".") {
      continue;
    }

    if (part === "..") {
      if (resolvedParts.length > 1) {
        resolvedParts.pop();
      }
      continue;
    }

    resolvedParts.push(part);
  }

  return resolvedParts.join(separator);
}

function mimeTypeFromPath(path: string) {
  const extension = extensionFromPath(path);
  const mimeByExtension: Record<string, string> = {
    avif: "image/avif",
    bin: "application/octet-stream",
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    ktx2: "image/ktx2",
    png: "image/png",
    webp: "image/webp"
  };

  return mimeByExtension[extension] ?? "application/octet-stream";
}

function collectExternalUris(gltf: {
  buffers?: Array<{ uri?: string }>;
  images?: Array<{ uri?: string }>;
}) {
  const uris = new Set<string>();

  for (const buffer of gltf.buffers ?? []) {
    if (buffer.uri && isLocalRelativeUri(buffer.uri)) {
      uris.add(buffer.uri);
    }
  }

  for (const image of gltf.images ?? []) {
    if (image.uri && isLocalRelativeUri(image.uri)) {
      uris.add(image.uri);
    }
  }

  return Array.from(uris);
}

async function createExternalResourceMap(gltfPath: string, gltfJson: string) {
  const gltf = JSON.parse(gltfJson) as {
    buffers?: Array<{ uri?: string }>;
    images?: Array<{ uri?: string }>;
  };
  const objectUrls: string[] = [];
  const urlMap = new Map<string, string>();
  const baseDir = directoryFromPath(gltfPath);
  const uris = collectExternalUris(gltf);

  for (const uri of uris) {
    const resolvedPath = resolvePath(baseDir, decodeURIComponent(uri));
    const bytes = await readFile(resolvedPath);
    const blob = new Blob([bytes], { type: mimeTypeFromPath(uri) });
    const objectUrl = URL.createObjectURL(blob);
    objectUrls.push(objectUrl);
    urlMap.set(uri, objectUrl);
  }

  return { objectUrls, urlMap };
}

function modelLoadErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (/unexpected|invalid|json|parse|glb|gltf/i.test(error.message)) {
      return "Could not parse this model. The file may be corrupt or not a valid glTF asset.";
    }

    return error.message;
  }

  return "Could not load the selected model.";
}

function disposeModel(model: THREE.Object3D) {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.geometry.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function createSampleModel() {
  const group = new THREE.Group();
  group.name = "sample-starter-scene";

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.7, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xc7c7c7, metalness: 0.15 })
  );
  body.position.set(0, 0.35, 0);
  body.castShadow = true;

  const topper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.5, 32),
    new THREE.MeshStandardMaterial({ color: 0x5b7cfa, roughness: 0.35 })
  );
  topper.position.set(0, 0.95, 0);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0x2f2f2f, roughness: 0.5 })
  );
  marker.position.set(0.38, 0.52, 0.25);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 0.08, 48),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.95 })
  );
  base.position.set(0, 0.04, 0);

  group.add(base, body, topper, marker);
  return group;
}

export const ModelViewer = forwardRef<ModelViewerHandle, ModelViewerProps>(
  function ModelViewer({ onLoadStateChange, path, wireframe }, ref) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const modelRef = useRef<THREE.Object3D | null>(null);
    const frameRef = useRef<number | null>(null);
    const [status, setStatus] = useState("No model loaded");
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        fitToView() {
          const camera = cameraRef.current;
          const controls = controlsRef.current;
          const model = modelRef.current;
          const renderer = rendererRef.current;

          if (!camera || !controls || !model || !renderer) {
            return;
          }

          fitCameraToObject(camera, controls, model, renderer);
        },
        setCameraPreset(preset) {
          const camera = cameraRef.current;
          const controls = controlsRef.current;
          const model = modelRef.current;
          const renderer = rendererRef.current;

          if (!camera || !controls || !model || !renderer) {
            return;
          }

          fitCameraToObject(
            camera,
            controls,
            model,
            renderer,
            cameraPresetDirections[preset]
          );
        }
      }),
      []
    );

    useEffect(() => {
      if (!path) {
        onLoadStateChange({ kind: "idle" });
      }
    }, [onLoadStateChange, path]);

    useEffect(() => {
      const host = hostRef.current;

      if (!host) {
        return;
      }

      const viewerElement = host;

      const scene = new THREE.Scene();
      scene.background = null;

      const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
      camera.position.set(4, 3, 4);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      viewerElement.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.9);
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(4, 8, 5);
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
      fillLight.position.set(-4, 2, -5);

      const grid = new THREE.GridHelper(10, 20, 0xd0d0d0, 0xe7e7e7);
      grid.position.y = -0.001;

      scene.add(ambientLight, keyLight, fillLight, grid);

      rendererRef.current = renderer;
      sceneRef.current = scene;
      cameraRef.current = camera;
      controlsRef.current = controls;

      function resize() {
        const width = Math.max(viewerElement.clientWidth, 1);
        const height = Math.max(viewerElement.clientHeight, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }

      const observer = new ResizeObserver(resize);
      observer.observe(viewerElement);
      resize();

      function animate() {
        controls.update();
        renderer.render(scene, camera);
        frameRef.current = window.requestAnimationFrame(animate);
      }

      animate();

      return () => {
        observer.disconnect();

        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
        }

        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
          }
        });
      };
    }, []);

    useEffect(() => {
      let cancelled = false;

      async function loadModel() {
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const renderer = rendererRef.current;

        if (!scene || !camera || !controls || !renderer || !path) {
          return;
        }

        setStatus("Loading model...");
        setError(null);
        onLoadStateChange({ kind: "loading" });

        if (modelRef.current) {
          scene.remove(modelRef.current);
          disposeModel(modelRef.current);
          modelRef.current = null;
        }

        try {
          if (isSamplePath(path)) {
            const sample = createSampleModel();
            scene.add(sample);
            modelRef.current = sample;
            fitCameraToObject(camera, controls, sample, renderer);
            onLoadStateChange({
              kind: "loaded",
              metadata: extractModelMetadata(sample, 0)
            });
            setStatus("Sample model loaded");
            return;
          }

          if (extensionFromPath(path) !== "glb") {
            if (extensionFromPath(path) !== "gltf") {
              throw new Error(
                "Only glTF (.glb and .gltf) files render in this build."
              );
            }
          }

          let fileSizeBytes = 0;
          let gltf: Awaited<ReturnType<GLTFLoader["parseAsync"]>>;

          if (extensionFromPath(path) === "glb") {
            const bytes = await readFile(path);
            fileSizeBytes = bytes.byteLength;
            const buffer = bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength
            );
            const loader = new GLTFLoader();
            gltf = await loader.parseAsync(buffer, "");
          } else {
            const gltfText = await readTextFile(path);
            const textBytes = new TextEncoder().encode(gltfText);
            fileSizeBytes = textBytes.byteLength;
            const { objectUrls, urlMap } = await createExternalResourceMap(
              path,
              gltfText
            );
            const manager = new THREE.LoadingManager();
            manager.setURLModifier((url) => urlMap.get(url) ?? url);
            const loader = new GLTFLoader(manager);

            try {
              gltf = await loader.parseAsync(gltfText, "");
            } finally {
              objectUrls.forEach((url) => URL.revokeObjectURL(url));
            }
          }

          if (cancelled) {
            return;
          }

          const model = gltf.scene;
          scene.add(model);
          modelRef.current = model;
          fitCameraToObject(camera, controls, model, renderer);
          onLoadStateChange({
            kind: "loaded",
            metadata: extractModelMetadata(model, fileSizeBytes)
          });
          setStatus("Model loaded");
        } catch (loadError) {
          if (cancelled) {
            return;
          }

          const message = modelLoadErrorMessage(loadError);
          setError(message);
          onLoadStateChange({
            kind: "failed",
            message
          });
          setStatus("Load failed");
        }
      }

      loadModel();

      return () => {
        cancelled = true;
      };
    }, [onLoadStateChange, path]);

    useEffect(() => {
      const model = modelRef.current;

      if (!model) {
        return;
      }

      model.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) {
          return;
        }

        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((material) => {
          material.wireframe = wireframe;
          material.needsUpdate = true;
        });
      });
    }, [wireframe]);

    return (
      <div className="model-viewer" ref={hostRef}>
        <div className="model-viewer-status">{status}</div>
        {error ? <div className="model-viewer-error">{error}</div> : null}
      </div>
    );
  }
);
