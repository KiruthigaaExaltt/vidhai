import * as React from "react";
import seedSvg from "@assets/seed.svg";
import { cn } from "@/lib/utils";

export interface SeedLoaderProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
}

/**
 * Vidhai animated seed sprout SVG loader.
 * Displays the sprouting seed animation representing Vidhai (Seed) ERP.
 */
export function SeedLoader({
  className,
  alt = "Loading...",
  ...props
}: SeedLoaderProps) {
  return (
    <img
      src={seedSvg}
      alt={alt}
      className={cn(
        "w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 object-contain select-none pointer-events-none",
        className,
      )}
      draggable={false}
      {...props}
    />
  );
}

// Backward compatibility alias for any existing imports
export const RadialLoader = SeedLoader;

export interface RadialPreloaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Full-screen preloader overlay featuring the animated Vidhai seed SVG.
 * - Perfectly centered horizontally and vertically
 * - Fixed full-screen overlay with z-50
 * - Matches the app theme background (bg-background)
 * - Accessible with role="status", aria-busy="true", and hidden screen-reader text
 */
export function SeedPreloader({
  className,
  size = "md",
}: RadialPreloaderProps) {
  const sizeClasses = {
    sm: "w-20 h-20 sm:w-24 sm:h-24",
    md: "w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40",
    lg: "w-36 h-36 sm:w-44 sm:h-44 md:w-48 md:h-48",
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background select-none overflow-hidden",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
    >
      <SeedLoader className={sizeClasses[size]} />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// Backward compatibility alias for any existing imports
export const RadialPreloader = SeedPreloader;
export default SeedPreloader;
