// Persisted "Simple | Advanced" preference for the video editor. A plain
// per-browser preference (not per-project), so it lives under its own key
// rather than beside per-video editor state.

export type EditorViewMode = "simple" | "advanced";

const STORAGE_KEY = "editor-view-mode";
const DEFAULT_MODE: EditorViewMode = "advanced";

export function loadEditorViewMode(): EditorViewMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    return localStorage.getItem(STORAGE_KEY) === "simple"
      ? "simple"
      : DEFAULT_MODE;
  } catch (e) {
    console.error("Failed to load editor view mode from localStorage:", e);
    return DEFAULT_MODE;
  }
}

export function saveEditorViewMode(mode: EditorViewMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch (e) {
    console.error("Failed to save editor view mode to localStorage:", e);
  }
}
