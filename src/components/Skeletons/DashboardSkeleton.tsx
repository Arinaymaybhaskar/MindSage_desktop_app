import MasonrySkeleton from "./MasonrySkeleton";

const SkeletonCard = () => (
  <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 h-36 animate-pulse">
    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4"></div>
    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6 mt-1"></div>
  </div>
);

const DashboardSkeleton = () => (
  <div className="px-6 py-10">
    <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-1/4 mb-2 animate-pulse"></div>
    <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/3 mb-8 animate-pulse"></div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6 animate-pulse">
      <div className="h-24 bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl"></div>
      <div className="h-24 bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl"></div>
      <div className="h-24 bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl"></div>
    </div>

    <div className="my-10">
      <div className="h-7 bg-gray-300 dark:bg-gray-700 rounded w-1/5 mb-6 animate-pulse"></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>

    <div className="w-full lg:h-[600px] md:h-[700px] h-[800px] p-5">
      <MasonrySkeleton />
    </div>
  </div>
);

export default DashboardSkeleton;
