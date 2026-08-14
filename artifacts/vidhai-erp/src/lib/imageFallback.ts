const FALLBACK_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" role="img" aria-label="Image unavailable">
    <rect width="320" height="180" fill="#f1f5f4"/>
    <g fill="none" stroke="#6b807b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="116" y="42" width="88" height="65" rx="6"/>
      <circle cx="177" cy="63" r="8"/>
      <path d="m122 99 22-23 18 17 13-13 23 24"/>
    </g>
    <text x="160" y="137" text-anchor="middle" fill="#50635f" font-family="Arial, sans-serif" font-size="16">Image unavailable</text>
  </svg>
`)}`;

/** Installs one accessible fallback for broken images, including portal content. */
export function installImageFallback() {
  const handleImageError = (event: Event) => {
    const image = event.target;

    if (
      !(image instanceof HTMLImageElement) ||
      image.dataset.fallbackApplied === "true"
    ) {
      return;
    }

    image.dataset.fallbackApplied = "true";
    image.alt = image.alt.trim() || "Image unavailable";
    image.src = FALLBACK_IMAGE;
  };

  document.addEventListener("error", handleImageError, true);
  return () => document.removeEventListener("error", handleImageError, true);
}
