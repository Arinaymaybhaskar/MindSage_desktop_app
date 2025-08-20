import MasonrySkeleton from "./MasonrySkeleton";

const SkeletonCard = () => (
  <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 h-36">
    <div className="h-4 bg-secondary-light dark:bg-secondary-dark rounded w-3/4 mb-4"></div>
    <div className="h-3 bg-secondary-light dark:bg-secondary-dark rounded w-1/2 mb-2"></div>
    <div className="h-3 bg-secondary-light dark:bg-secondary-dark rounded w-full"></div>
    <div className="h-3 bg-secondary-light dark:bg-secondary-dark rounded w-5/6 mt-1"></div>
  </div>
);

const DashboardSkeleton = () => (
  <div className="px-6 py-10 animate-pulse">
    <div className="max-w-7xl">
      {/* Page Title Skeletons */}
      <div className="h-8 bg-tertiary-light dark:bg-tertiary-dark rounded w-1/4 mb-2"></div>
      <div className="h-4 bg-tertiary-light dark:bg-tertiary-dark rounded w-1/3 mb-8"></div>

      {/* Stat Cards Skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6">
        <div className="h-24 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl"></div>
        <div className="h-24 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl"></div>
        <div className="h-24 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl"></div>
      </div>

      {/* Section with Skeleton Cards */}
      <div className="my-10">
        <div className="h-7 bg-tertiary-light dark:bg-tertiary-dark rounded w-1/5 mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>

      {/* Masonry Skeleton Container */}
      <div className="w-full lg:h-[600px] md:h-[700px] h-[800px] p-5">
        <MasonrySkeleton />
      </div>
    </div>
  </div>
);

export default DashboardSkeleton;
