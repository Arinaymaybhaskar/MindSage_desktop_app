/**
 * Mirrors the dashboard's bento grid (see dashBoard.tsx) so there is no
 * layout jump when real data replaces the skeleton: same header shape, same
 * grid-cols-1 md:grid-cols-2 lg:grid-cols-12 tracks, same col-spans per tile.
 */
const Tile = ({
  span,
  height,
  emphasis = false,
}: {
  span: string;
  height: string;
  emphasis?: boolean;
}) => (
  <div
    className={`${span} ${height} rounded-2xl border ${
      emphasis
        ? "border-border-light/80 dark:border-border-dark/80 bg-surface-light dark:bg-surface-dark"
        : "border-border-light/60 dark:border-border-dark/60 bg-secondary-light dark:bg-secondary-dark"
    }`}
  />
);

const DashboardSkeleton = () => (
  <div className="bg-base-light dark:bg-base-dark h-full overflow-y-auto">
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 animate-pulse">
      {/* Header: greeting + subtitle + avatar, matching the real hero */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="h-9 w-2/3 max-w-sm bg-tertiary-light dark:bg-tertiary-dark rounded"></div>
          <div className="mt-3 h-4 w-1/2 max-w-xs bg-tertiary-light dark:bg-tertiary-dark rounded"></div>
          <div className="mt-4 h-9 w-32 bg-tertiary-light dark:bg-tertiary-dark rounded-xl"></div>
        </div>
        <div className="h-20 w-20 flex-shrink-0 rounded-full bg-tertiary-light dark:bg-tertiary-dark"></div>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12">
        {/* Row 1: heatmap + streak */}
        <Tile span="lg:col-span-8" height="h-56" emphasis />
        <Tile span="lg:col-span-4" height="h-56" />

        {/* Row 2: mood, entries, words, goals stat tiles */}
        <Tile span="lg:col-span-3" height="h-24" />
        <Tile span="lg:col-span-3" height="h-24" />
        <Tile span="lg:col-span-3" height="h-24" />
        <Tile span="lg:col-span-3" height="h-24" />

        {/* Row 3: recent entries + pinned goals */}
        <Tile span="lg:col-span-8" height="h-40" />
        <Tile span="lg:col-span-4" height="h-40" />

        {/* Row 4: memories strip */}
        <Tile span="lg:col-span-12" height="h-32" />
      </div>
    </main>
  </div>
);

export default DashboardSkeleton;
