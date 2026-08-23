const SettingsSkeleton = () => {
  return (
    <div className="bg-base-light dark:bg-base-dark h-full overflow-y-auto">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
        <div className="h-9 bg-tertiary-light dark:bg-tertiary-dark rounded w-40 mb-2"></div>
        <div className="h-5 bg-tertiary-light dark:bg-tertiary-dark rounded w-64 mb-8"></div>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">
          {/* Sidebar Skeleton */}
          <div className="lg:w-1/4 w-full space-y-1">
            <div className="h-10 bg-tertiary-light dark:bg-tertiary-dark rounded-lg"></div>
            <div className="h-10 bg-tertiary-light dark:bg-tertiary-dark rounded-lg"></div>
            <div className="h-10 bg-tertiary-light dark:bg-tertiary-dark rounded-lg"></div>
            <div className="h-10 bg-tertiary-light dark:bg-tertiary-dark rounded-lg"></div>
            <div className="h-10 bg-tertiary-light dark:bg-tertiary-dark rounded-lg"></div>
            <div className="h-10 bg-tertiary-light dark:bg-tertiary-dark rounded-lg"></div>
          </div>
          {/* Content Skeleton */}
          <div className="lg:w-3/4 w-full">
            <div className="bg-secondary-light dark:bg-secondary-dark p-6 rounded-2xl border border-border-light dark:border-border-dark">
              <div className="h-6 bg-tertiary-light dark:bg-tertiary-dark rounded w-1/3 mb-6"></div>
              <div className="space-y-6">
                <div className="h-16 bg-tertiary-light dark:bg-tertiary-dark rounded-lg"></div>
                <div className="h-16 bg-tertiary-light dark:bg-tertiary-dark rounded-lg"></div>
                <div className="h-16 bg-tertiary-light dark:bg-tertiary-dark rounded-lg"></div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsSkeleton;
