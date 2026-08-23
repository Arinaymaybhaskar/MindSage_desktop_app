import React from "react";
import useLazyThumbnail from "../hooks/useLazyThumbnail";

/**
 * An image tile that fetches its (resized) source only when scrolled near.
 *
 * Renders a placeholder immediately so the layout is stable and the grid does
 * not reflow as pictures arrive.
 */
interface LazyThumbProps {
  imagePath: string;
  alt: string;
  className?: string;
  maxWidth?: number;
}

export const LazyThumb: React.FC<LazyThumbProps> = ({
  imagePath,
  alt,
  className = "",
  maxWidth = 480,
}) => {
  const { ref, src, loaded } = useLazyThumbnail(imagePath, maxWidth);

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`relative overflow-hidden bg-tertiary-light dark:bg-tertiary-dark ${className}`}
    >
      {src && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover transition-opacity duration-500 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
};

export default LazyThumb;
