/**
 * VisionGuard Neural Model Preloader & Cache Singleton
 * Loads TinyFaceDetector, FaceLandmark68Net, and FaceRecognitionNet in parallel.
 * Caches loaded weights in memory so Live Monitoring begins face detection instantly with 0ms wait.
 */

let isLoaded = false;
let loadPromise: Promise<boolean> | null = null;

export const areModelsLoaded = (): boolean => {
  const faceapi = (typeof window !== 'undefined' ? (window as any).faceapi : null);
  if (!faceapi) return false;
  if (isLoaded) return true;
  
  const ready = !!(
    faceapi.nets?.tinyFaceDetector?.params &&
    faceapi.nets?.faceLandmark68Net?.params &&
    faceapi.nets?.faceRecognitionNet?.params
  );
  if (ready) isLoaded = true;
  return ready;
};

export const loadFaceModels = (): Promise<boolean> => {
  if (areModelsLoaded()) {
    isLoaded = true;
    return Promise.resolve(true);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const faceapi = (typeof window !== 'undefined' ? (window as any).faceapi : null);
    if (!faceapi) {
      console.warn('[ModelLoader] face-api global not found on window. Will retry when available.');
      loadPromise = null;
      return false;
    }

    const sources = [
      '/models',
      'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights',
      'https://unpkg.com/face-api.js@0.22.2/weights'
    ];

    for (const src of sources) {
      try {
        console.log(`[ModelLoader] Fast-loading neural models in parallel from: ${src}`);
        // Load all 3 models in parallel for minimum startup latency
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(src),
          faceapi.nets.faceLandmark68Net.loadFromUri(src),
          faceapi.nets.faceRecognitionNet.loadFromUri(src)
        ]);
        console.log(`[ModelLoader] ✅ All neural models loaded and cached from: ${src}`);
        isLoaded = true;
        return true;
      } catch (err) {
        console.warn(`[ModelLoader] Source ${src} failed, attempting next fallback...`, err);
      }
    }

    console.error('[ModelLoader] ❌ Failed to load neural models from all sources.');
    loadPromise = null;
    return false;
  })();

  return loadPromise;
};

// Immediately kick off background warm-up as soon as script is evaluated
if (typeof window !== 'undefined') {
  // If face-api is already loaded via script tag in head, preload immediately
  if ((window as any).faceapi) {
    loadFaceModels().catch(() => {});
  } else {
    // Or wait for window load event
    window.addEventListener('load', () => {
      loadFaceModels().catch(() => {});
    }, { once: true });
  }
}
