import { useEffect, useRef, useState } from "react";

/**
 * Loads a thumbnail only once its tile is about to be seen.
 *
 * Grids previously asked for every image up front, and each one came back as a
 * base64 data URL of the *original* file. On a page showing a whole journal's
 * photographs that is tens of megabytes crossing IPC before anything renders.
 *
 * This defers the request until the element is near the viewport, and asks for
 * a resized JPEG rather than the original. The full-resolution image is still
 * what an entry page loads.
 */
export function useLazyThumbnail(
  imagePath: string | null | undefined,
  maxWidth = 480
) {
  const ref = useRef<HTMLElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    // No IntersectionObserver (or a detached element) should degrade to
    // loading rather than to a permanently blank tile.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Start fetching a screen early so tiles are ready by the time they
      // arrive rather than popping in under the cursor.
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !imagePath) return;
    let cancelled = false;

    window.electron.ipcRenderer
      .invoke<string | null>("media:getThumbnail", String(imagePath), maxWidth)
      .then((dataUrl: string | null) => {
        if (!cancelled) setSrc(dataUrl ?? null);
      })
      .catch((err: unknown) => {
        console.error("Failed to load thumbnail:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, imagePath, maxWidth]);

  return { ref, src, loaded: Boolean(src) };
}

export default useLazyThumbnail;
