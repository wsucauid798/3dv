import { useCallback, useEffect, useRef, useState } from "react";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Box,
  CheckCircle2,
  Maximize,
  MessageSquare,
  RotateCcw,
  Ruler,
  Upload,
  VenetianMask,
  View,
  Waypoints
} from "lucide-react";
import { Button, Divider, IconButton, Panel, TooltipProvider } from "./ui";
import {
  ModelViewer,
  type CameraPreset,
  type ModelViewerHandle,
  type ViewerLoadState
} from "./viewer/ModelViewer";

type SelectedModel = {
  name: string;
  path: string;
};

type DragDropPayload = {
  paths?: string[];
  position?: {
    x: number;
    y: number;
  };
};

const modelExtensions = new Set([
  "glb",
  "gltf",
  "stl",
  "obj",
  "ply",
  "3mf",
  "fbx"
]);

const initialLoadState: ViewerLoadState = {
  kind: "idle"
};

const sampleModelPath = "sample://starter-scene";

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

function extensionFromPath(path: string) {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function isSupportedSelection(path: string) {
  return modelExtensions.has(extensionFromPath(path));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDimension(value: number) {
  if (!Number.isFinite(value)) {
    return "unknown";
  }

  return `${value.toFixed(value >= 10 ? 1 : 3)} units`;
}

function statusLabel(
  selectedModel: SelectedModel | null,
  state: ViewerLoadState
) {
  if (!selectedModel) {
    return "No file selected";
  }

  if (state.kind === "loading") {
    return selectedModel?.path === sampleModelPath
      ? "Loading sample model"
      : "Loading model";
  }

  if (state.kind === "loaded") {
    return selectedModel?.path === sampleModelPath
      ? "Sample model loaded"
      : "Model loaded";
  }

  if (state.kind === "failed") {
    return "Load failed";
  }

  return "File selected";
}

const cameraPresets: Array<{ label: string; preset: CameraPreset }> = [
  { label: "Front view", preset: "front" },
  { label: "Side view", preset: "side" },
  { label: "Top view", preset: "top" },
  { label: "Isometric view", preset: "isometric" }
];

export function App() {
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(
    null
  );
  const [loadState, setLoadState] = useState<ViewerLoadState>(initialLoadState);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isWireframe, setIsWireframe] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const viewerRef = useRef<ModelViewerHandle | null>(null);
  const handleLoadStateChange = useCallback((state: ViewerLoadState) => {
    setLoadState(state);
  }, []);

  const selectModelPath = useCallback((path: string) => {
    if (!isSupportedSelection(path)) {
      setOpenError(
        "Unsupported file type. Choose GLB, glTF, STL, OBJ, PLY, 3MF, or FBX."
      );
      setSelectedModel(null);
      setLoadState({ kind: "idle" });
      return;
    }

    setOpenError(null);
    setSelectedModel({
      name: fileNameFromPath(path),
      path
    });
    setLoadState({ kind: "loading" });
  }, []);

  const loadSampleModel = useCallback(() => {
    setOpenError(null);
    setSelectedModel({
      name: "Sample model",
      path: sampleModelPath
    });
    setLoadState({ kind: "loading" });
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (isTextInput || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key.toLowerCase() === "f") {
        viewerRef.current?.fitToView();
      }

      if (event.key === "1" && loadState.kind === "loaded") {
        viewerRef.current?.setCameraPreset("front");
      }

      if (event.key === "3" && loadState.kind === "loaded") {
        viewerRef.current?.setCameraPreset("side");
      }

      if (event.key === "7" && loadState.kind === "loaded") {
        viewerRef.current?.setCameraPreset("top");
      }

      if (event.key.toLowerCase() === "w" && loadState.kind === "loaded") {
        setIsWireframe((current) => !current);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [loadState.kind]);

  useEffect(() => {
    let cleanup: Array<() => void> = [];
    let disposed = false;

    async function bindDragEvents() {
      const unlistenEnter = await listen<DragDropPayload>(
        TauriEvent.DRAG_ENTER,
        () => {
          setIsDraggingFile(true);
        }
      );
      const unlistenDrop = await listen<DragDropPayload>(
        TauriEvent.DRAG_DROP,
        (event) => {
          setIsDraggingFile(false);
          const [path] = event.payload.paths ?? [];

          if (path) {
            selectModelPath(path);
          }
        }
      );
      const unlistenLeave = await listen<DragDropPayload>(
        TauriEvent.DRAG_LEAVE,
        () => {
          setIsDraggingFile(false);
        }
      );

      cleanup = [unlistenEnter, unlistenDrop, unlistenLeave];

      if (disposed) {
        cleanup.forEach((unlisten) => unlisten());
      }
    }

    bindDragEvents();

    return () => {
      disposed = true;
      cleanup.forEach((unlisten) => unlisten());
    };
  }, [selectModelPath]);

  async function handleOpenModel() {
    setOpenError(null);

    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "3D models",
            extensions: ["glb", "gltf", "stl", "obj", "ply", "3mf", "fbx"]
          },
          {
            name: "glTF",
            extensions: ["glb", "gltf"]
          }
        ]
      });

      if (typeof selected !== "string") {
        return;
      }

      selectModelPath(selected);
    } catch (error) {
      setOpenError(
        error instanceof Error ? error.message : "Could not open file picker."
      );
    }
  }

  return (
    <TooltipProvider>
      <main className="app-shell">
        <section className="viewer-surface" aria-label="3D viewer placeholder">
          <header className="viewer-toolbar">
            <div className="toolbar-group" aria-label="File actions">
              <Button onClick={handleOpenModel}>
                <Upload size={16} />
                Open model
              </Button>
              <IconButton
                disabled={loadState.kind !== "loaded"}
                icon={<Maximize size={18} />}
                label="Fit to view"
                onClick={() => viewerRef.current?.fitToView()}
              />
              <IconButton
                disabled={loadState.kind !== "loaded"}
                icon={<RotateCcw size={18} />}
                label="Reset view"
                onClick={() => viewerRef.current?.setCameraPreset("isometric")}
              />
            </div>
            <div className="toolbar-group" aria-label="Review tools">
              {cameraPresets.map((cameraPreset) => (
                <IconButton
                  disabled={loadState.kind !== "loaded"}
                  icon={<View size={18} />}
                  key={cameraPreset.preset}
                  label={cameraPreset.label}
                  onClick={() =>
                    viewerRef.current?.setCameraPreset(cameraPreset.preset)
                  }
                />
              ))}
              <IconButton
                aria-pressed={isWireframe}
                disabled={loadState.kind !== "loaded"}
                icon={<VenetianMask size={18} />}
                label={isWireframe ? "Solid view" : "Wireframe view"}
                onClick={() => setIsWireframe((current) => !current)}
              />
              <IconButton icon={<Ruler size={18} />} label="Measure" />
              <IconButton icon={<MessageSquare size={18} />} label="Annotate" />
              <IconButton icon={<Waypoints size={18} />} label="Saved views" />
            </div>
          </header>

          {isDraggingFile ? (
            <div className="drop-overlay" aria-live="polite">
              Drop model to open
            </div>
          ) : null}

          {selectedModel ? (
            <ModelViewer
              onLoadStateChange={handleLoadStateChange}
              path={selectedModel.path}
              ref={viewerRef}
              wireframe={isWireframe}
            />
          ) : (
            <div className="viewer-empty-state">
              <div className="drop-zone">
                <p className="eyebrow">3DV</p>
                <h1>Review 3D files without opening an authoring tool.</h1>
                <p>
                  Drop a glTF model (.glb or .gltf) here or open one to inspect
                  it with orbit controls and fit-to-view.
                </p>
                <div className="empty-state-actions">
                  <Button onClick={loadSampleModel} variant="secondary">
                    Load sample model
                  </Button>
                </div>
                {openError ? <p className="open-error">{openError}</p> : null}
              </div>
            </div>
          )}

          <footer className="viewer-statusbar">
            <span>
              {selectedModel ? selectedModel.name : "No model loaded"}
            </span>
            <span>units: auto</span>
          </footer>
        </section>

        <aside className="info-panel" aria-label="Review status">
          <div className="info-panel-title">
            <h2>Design review</h2>
            <Box aria-hidden="true" size={20} />
          </div>

          <Panel aria-label="File metadata">
            <h3>File</h3>
            <dl className="metadata-list">
              <div>
                <dt>Workflow</dt>
                <dd>Design / approval</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{statusLabel(selectedModel, loadState)}</dd>
              </div>
              {loadState.kind === "failed" ? (
                <div>
                  <dt>Issue</dt>
                  <dd className="load-issue">{loadState.message}</dd>
                </div>
              ) : null}
              {loadState.kind === "loaded" ? (
                <>
                  <div>
                    <dt>File size</dt>
                    <dd>{formatFileSize(loadState.metadata.fileSizeBytes)}</dd>
                  </div>
                  <div>
                    <dt>Dimensions</dt>
                    <dd>
                      {formatDimension(loadState.metadata.dimensions.x)} x{" "}
                      {formatDimension(loadState.metadata.dimensions.y)} x{" "}
                      {formatDimension(loadState.metadata.dimensions.z)}
                    </dd>
                  </div>
                  <div>
                    <dt>Triangles</dt>
                    <dd>{formatNumber(loadState.metadata.triangleCount)}</dd>
                  </div>
                  <div>
                    <dt>Vertices</dt>
                    <dd>{formatNumber(loadState.metadata.vertexCount)}</dd>
                  </div>
                </>
              ) : null}
              {selectedModel ? (
                <div>
                  <dt>Path</dt>
                  <dd className="file-path">{selectedModel.path}</dd>
                </div>
              ) : null}
              <div>
                <dt>Next</dt>
                <dd>Drag-and-drop and file size readout</dd>
              </div>
            </dl>
          </Panel>

          <Panel aria-label="Review actions">
            <h3>Decision</h3>
            <Divider />
            <div className="review-actions">
              <Button>
                <CheckCircle2 size={16} />
                Approve
              </Button>
              <Button variant="secondary">
                <MessageSquare size={16} />
                Request changes
              </Button>
            </div>
          </Panel>
        </aside>
      </main>
    </TooltipProvider>
  );
}
