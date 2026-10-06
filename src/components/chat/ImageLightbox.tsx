import React, { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion, useMotionValue } from "framer-motion";
import { X, ZoomIn, ZoomOut, RefreshCw } from "lucide-react";

export interface ImageLightboxProps {
  url: string | null;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  url,
  onClose,
}) => {
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setScale(1);
    setMinScale(1);
    x.set(0);
    y.set(0);
  }, [url, x, y]);

  const handleImageLoad = () => {
    if (!imageRef.current || !imageContainerRef.current) return;
    const { naturalWidth, naturalHeight } = imageRef.current;
    const { clientWidth: containerWidth, clientHeight: containerHeight } =
      imageContainerRef.current;
    if (naturalWidth === 0 || naturalHeight === 0) return;

    const scaleX = containerWidth / naturalWidth;
    const scaleY = containerHeight / naturalHeight;
    const initialFitScale = Math.min(scaleX, scaleY, 1);

    setMinScale(initialFitScale);
    setScale(initialFitScale);
  };

  const handleZoom = useCallback(
    (delta: number) => {
      setScale((prevScale) => {
        const newScale = prevScale + delta;
        const clampedScale = Math.max(minScale, Math.min(5, newScale));

        if (clampedScale === minScale) {
          x.set(0);
          y.set(0);
        }
        return clampedScale;
      });
    },
    [minScale, x, y],
  );

  const handleWheelZoom = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const zoomAmount = e.deltaY * -0.0015;
      handleZoom(zoomAmount);
    },
    [handleZoom],
  );

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(minScale);
    x.set(0);
    y.set(0);
  };

  const handleControlClick = (e: React.MouseEvent) => e.stopPropagation();
  const handleZoomIn = (e: React.MouseEvent) => {
    handleControlClick(e);
    handleZoom(0.2);
  };
  const handleZoomOut = (e: React.MouseEvent) => {
    handleControlClick(e);
    handleZoom(-0.2);
  };

  return (
    <AnimatePresence>
      {url && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose} // This now works correctly
        >
          {/* **FIX**: This is the new content wrapper. It is NOT full-screen, allowing the backdrop to be clicked. */}
          <div
            className="relative"
            onClick={(e) => e.stopPropagation()} // stopPropagation is now on this smaller container
          >
            {/* The visual container for the image */}
            <div
              ref={imageContainerRef}
              className="w-[90vw] h-[80vh] flex items-center justify-center overflow-hidden rounded-lg bg-white/10"
              onWheel={handleWheelZoom}
            >
              <motion.img
                key={url}
                ref={imageRef}
                src={url}
                alt="Enlarged preview"
                className="cursor-grab"
                style={{ maxWidth: "none", maxHeight: "none", x, y }}
                onLoad={handleImageLoad}
                animate={{ scale }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                drag={scale > minScale}
                dragConstraints={imageContainerRef}
                dragElastic={0.05}
                whileTap={{ cursor: "grabbing" }}
              />
            </div>

            {/* **FIX**: Close Button is positioned relative to the new content wrapper, making it visible */}
            <button
              className="absolute -top-3 -right-3 bg-white/60 hover:bg-white text-black rounded-full p-2 shadow-lg z-20"
              onClick={onClose}
              aria-label="Close image"
            >
              <X size={20} />
            </button>

            {/* Zoom Controls */}
            <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-x-2 bg-black/60 text-white rounded-full p-2 shadow-lg z-20">
              <button
                onClick={handleZoomOut}
                className="p-2 hover:bg-white/20 rounded-full"
                aria-label="Zoom out"
              >
                <ZoomOut size={20} />
              </button>
              <button
                onClick={handleResetZoom}
                className="p-2 hover:bg-white/20 rounded-full"
                aria-label="Reset zoom"
              >
                <RefreshCw size={18} />
              </button>
              <button
                onClick={handleZoomIn}
                className="p-2 hover:bg-white/20 rounded-full"
                aria-label="Zoom in"
              >
                <ZoomIn size={20} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ImageLightbox;
