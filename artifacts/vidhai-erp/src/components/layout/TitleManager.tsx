import { useEffect } from "react";
import { useLocation } from "wouter";
import { getDocumentTitle } from "@/lib/titles";

/**
 * Hook to automatically synchronize document.title with the current route location.
 */
export function useDocumentTitle() {
  const [location] = useLocation();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const nextTitle = getDocumentTitle(location);
    if (document.title !== nextTitle) {
      document.title = nextTitle;
    }
  }, [location]);
}

/**
 * Headless component mounted inside WouterRouter that reactively manages document.title.
 */
export function TitleManager() {
  useDocumentTitle();
  return null;
}
