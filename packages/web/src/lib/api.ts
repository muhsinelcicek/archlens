import { useStore } from "./store.js";

/**
 * Build an API URL with the active project as query parameter.
 * Use this for all analyzer endpoints so they return data for the
 * currently selected project, not the first registered one.
 *
 * Example:
 *   apiUrl("/api/quality") → "/api/quality?project=fastapi"
 */
export function apiUrl(path: string): string {
  const active = useStore.getState().activeProject;
  if (!active) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}project=${encodeURIComponent(active)}`;
}

/**
 * Fetch helper that automatically adds the active project to the URL.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}
