# 3DV

3DV is a desktop application that let's you view 3D models and inspected them.

Current focus:
- Open and inspect glTF models (`.glb`, `.gltf`).
- Orbit, fit-to-view, camera presets, wireframe toggle.
- Basic model metadata (size, bounds, triangles, vertices).

## Prerequisites

- Node.js + npm
- Rust toolchain (`rustup`, `cargo`)

## Install

```powershell
npm install
```

If your shell has trouble resolving `npm`, use:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' install
```

## Develop

Run the desktop app in dev mode:

```powershell
npm run tauri -- dev
```

Optional web-only dev server:

```powershell
npm run dev
```

## Build

Frontend production build:

```powershell
npm run build
```

Desktop build (Windows, no installer bundle):

```powershell
npm run tauri -- build --no-bundle
```

If needed, use `npm.cmd`:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run tauri -- build --no-bundle
```

## Run Built App

After desktop build, run:

```powershell
.\src-tauri\target\release\three_dv.exe
```
