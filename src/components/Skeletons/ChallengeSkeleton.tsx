const ChallengeSkeleton = () => {
  return (
    <div className="px-6 py-10 animate-pulse">
      {/* Skeleton for the page title */}
      <div className="h-8 bg-tertiary-light dark:bg-tertiary-dark rounded w-1/3 mb-8"></div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Skeleton for the main content block */}
        <div className="lg:col-span-3">
          <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl h-96">
            <div className="h-6 bg-tertiary-light dark:bg-tertiary-dark rounded w-1/2 mb-4"></div>
            <div className="h-4 bg-secondary-light dark:bg-secondary-dark rounded w-full mb-2"></div>
            <div className="h-4 bg-secondary-light dark:bg-secondary-dark rounded w-5/6"></div>
          </div>
        </div>

        {/* Skeleton for the sidebar block */}
        <div className="lg:col-span-2">
          <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl h-96">
            <div className="h-6 bg-tertiary-light dark:bg-tertiary-dark rounded w-3/4 mb-6"></div>
            <div className="space-y-4">
              <div className="h-16 bg-tertiary-light dark:bg-tertiary-dark rounded-lg"></div>
              <div className="h-16 bg-tertiary-light dark:bg-tertiary-dark rounded-lg"></div>
              <div className="h-16 bg-tertiary-light dark:bg-tertiary-dark rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChallengeSkeleton;
