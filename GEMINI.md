# Performance and Architecture Guidelines

This document outlines the critical performance and architectural rules learned during the development of this project. AI Assistants and developers **must** strictly adhere to these rules.

## 1. High-Frequency UI Updates and Web Workers
**Rule**: NEVER update React state synchronously inside a high-frequency callback (such as download progress, scroll listeners, or tight `postMessage` loops from Web Workers).
*   **Why**: Doing so queues thousands of React renders per second, completely freezing the browser's main UI thread.
*   **Solution**: Implement a time-based throttle (e.g., 100ms/10FPS) before calling `setState` or `postMessage` from the worker.
```typescript
// Example Throttle Pattern
let lastTime = 0;
if (Date.now() - lastTime > 100 || isFinished) {
  lastTime = Date.now();
  postMessage(update); // or setReactState(update)
}
```

## 2. transformers.js Network Configuration
**Rule**: Always configure a fallback mirror for Hugging Face Hub.
*   **Why**: The default `huggingface.co` domain is frequently blocked in certain regions (e.g., China), causing `Failed to fetch` errors when pulling models (like embeddings) via `transformers.js`.
*   **Solution**: Inject the `hf-mirror` domain on initialization:
```typescript
import { env } from '@xenova/transformers';
env.allowLocalModels = false;
env.useBrowserCache = true;
env.remoteHost = 'https://hf-mirror.com';
```

## 3. High-Performance Canvas & PDF Rendering
**Rule**: Avoid declarative React `<canvas>` nodes for large, virtualized, or frequently unmounted visual components. 
*   **Why**: React's virtual DOM reconciliation and garbage collection cannot reliably free underlying GPU textures fast enough for massive PDFs, leading to severe memory leaks (e.g., 10GB+ RAM consumption).
*   **Solution**: Use manual DOM mounting and explicit destruction.
  1.  Create the canvas using `document.createElement('canvas')`.
  2.  Append it to a stable `useRef` container.
  3.  When leaving the viewport or unmounting, explicitly call `.width = 0; .height = 0;` and `container.removeChild(canvas)` to force GPU context release.

## 4. WASM & PDF.js Cleanup
**Rule**: Explicitly destroy proxy objects before losing their references.
*   **Why**: WASM heaps and WebGL buffers are outside of JavaScript's standard Garbage Collection reach. If the JS proxy reference is lost without calling its cleanup method, the memory leaks permanently.
*   **Solution**:
  *   For pdf.js: Always call `pageProxy.cleanup()` and `documentProxy.destroy()`.
  *   For WASM modules: Call `.free()` or the equivalent teardown method when the task completes or cancels.
