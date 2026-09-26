// Browser-harness-only replacement; never included by the application build.
// Camera capture still runs through Chromium getUserMedia and react-webcam.
export async function load() {
  return { estimateFaces: async () => Array.from({ length: window.__auditFaceCount ?? 1 }, () => ({})) };
}
