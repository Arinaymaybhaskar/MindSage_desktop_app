import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ImageIcon } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import journalService from "../api/journalService";
import MasonrySkeleton from "../components/Skeletons/MasonrySkeleton";
import type { JournalImageEntry } from "../types/Dashboard";

const Masonry = lazy(() => import("../components/masonry"));

type ImageEntry = JournalImageEntry;

/**
 * Every photo in the journal, as a masonry wall.
 *
 * This used to sit at the bottom of the dashboard, where it was 600px tall and
 * the single biggest reason that page needed scrolling. It is worth a screen of
 * its own rather than a footer: the dashboard now shows a strip of the most
 * recent few and links here for the rest, and here it can show *all* of them
 * instead of the ten the dashboard query was capped at.
 */
export default function Memories() {
  const { accessToken } = useAuth();
  const [entries, setEntries] = useState<ImageEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const authMode = localStorage.getItem("authMode") || "offline";

  useEffect(() => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const keys: ImageEntry[] = await journalService.getImages(
          authMode,
          accessToken,
          "all",
        );
        if (cancelled || !Array.isArray(keys)) return;

        // Thumbnails, not originals. The masonry preloads every image before
        // it will render, so asking for full-resolution files here meant the
        // page stayed blank until the entire album had crossed IPC as base64.
        // 640px covers the widest tile at 2x and is ~30KB instead of megabytes.
        const withSrc = await Promise.all(
          keys.filter(Boolean).map(async (entry) => ({
            ...entry,
            image_key: await window.electron.ipcRenderer.invoke<string>(
              "media:get-thumbnail",
              String(entry.image_key),
              640,
            ),
          })),
        );
        if (!cancelled) setEntries(withSrc.filter((e) => e.image_key));
      } catch (err) {
        console.error("Failed to load memories:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, authMode]);

  const items = useMemo(
    () =>
      entries.map((entry) => ({
        id: String(entry.id),
        title: entry.title,
        img: entry.image_key,
        url: `/journal/view/${entry.id}`,
        // The masonry positions by explicit height; varied heights are what
        // make the wall read as a wall rather than a uniform grid.
        height: Math.floor(Math.random() * (500 - 250 + 1)) + 250,
      })),
    [entries],
  );

  return (
    <div className="bg-base-light dark:bg-base-dark h-full overflow-y-auto">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
        <header className="mb-8">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-light-sub dark:text-text-dark-sub hover:text-text-light dark:hover:text-text-dark transition-colors"
          >
            <ArrowLeft size={14} />
            Dashboard
          </Link>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-text-light dark:text-text-dark">
            Memories
          </h1>
          <p className="mt-2 text-[15px] text-text-light-sub dark:text-text-dark-sub">
            {isLoading
              ? "Gathering your photographs…"
              : entries.length > 0
                ? `${entries.length} ${
                    entries.length === 1 ? "photograph" : "photographs"
                  } from your entries. Click one to open the day it belongs to.`
                : "Photos you attach to entries collect here."}
          </p>
        </header>

        <div data-testid="memories-grid" className="w-full min-h-[400px]">
          {isLoading ? (
            <MasonrySkeleton />
          ) : items.length > 0 ? (
            <Suspense fallback={<MasonrySkeleton />}>
              <Masonry
                items={items}
                ease="power3.out"
                duration={0.6}
                stagger={0.05}
                animateFrom="bottom"
              />
            </Suspense>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-light dark:border-border-dark py-20 text-center">
              <ImageIcon
                size={22}
                className="text-text-light-sub/60 dark:text-text-dark-sub/60"
              />
              <p className="mt-3 text-sm font-medium text-text-light dark:text-text-dark">
                No photos yet
              </p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-text-light-sub dark:text-text-dark-sub">
                Attach a photo to an entry and it will appear here alongside the
                rest of your year.
              </p>
              <Link
                to="/journal/new"
                className="mt-5 rounded-xl bg-dark1 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Write an entry
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
