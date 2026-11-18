import { useEffect, useState, useCallback } from "react";

export function getHashPath(): string {
  const h = window.location.hash.replace(/^#/, "");
  if (!h) return "/";
  return h.startsWith("/") ? h : "/" + h;
}

export function navigate(path: string) {
  if (window.location.hash !== "#" + path) {
    window.location.hash = path;
  }
}

export function useHashRoute(): [string, (p: string) => void] {
  const [path, setPath] = useState(getHashPath());

  useEffect(() => {
    const onHash = () => setPath(getHashPath());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const nav = useCallback((p: string) => navigate(p), []);
  return [path, nav];
}
