import { useEffect, useState } from "react";
import { ExternalLink, X, ZoomIn, ZoomOut } from "lucide-react";
import { apiAssetUrl } from "@/lib/apiAssetUrl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type ImageLightboxProps = {
  source: string | null;
  onClose: () => void;
  alt?: string;
};

export function ImageLightbox({ source, onClose, alt = "Verification photo" }: ImageLightboxProps) {
  const [zoomed, setZoomed] = useState(false);
  const resolvedSource = apiAssetUrl(source);

  useEffect(() => setZoomed(false), [source]);

  return (
    <Dialog open={!!source} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[94vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden border-0 bg-black/95 p-0 shadow-2xl"
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/15 px-4 py-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setZoomed((current) => !current)}
            >
              {zoomed ? <ZoomOut className="mr-2 h-4 w-4" /> : <ZoomIn className="mr-2 h-4 w-4" />}
              {zoomed ? "Fit image" : "Zoom 2x"}
            </Button>
            {source && (
              <Button type="button" size="sm" variant="secondary" asChild>
                <a href={resolvedSource} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> Open original
                </a>
              </Button>
            )}
          </div>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={onClose}
            aria-label="Close image preview"
            className="h-8 w-8 text-white hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {source && (
            <button
              type="button"
              className={`mx-auto flex min-h-full min-w-full items-center justify-center ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
              onClick={() => setZoomed((current) => !current)}
              aria-label={zoomed ? "Fit image to screen" : "Zoom image"}
            >
              <img
                src={resolvedSource}
                alt={alt}
                className={zoomed ? "h-auto max-w-none" : "max-h-[84vh] max-w-full object-contain"}
                style={zoomed ? { width: "200%" } : undefined}
              />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
