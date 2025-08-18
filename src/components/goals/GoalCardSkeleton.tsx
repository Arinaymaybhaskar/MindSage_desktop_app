// src/components/goals/GoalCardSkeleton.tsx
import React from "react";

const GoalCardSkeleton: React.FC = () => {
  return (
    <div className="w-80 h-96 rounded-xl bg-gray-800 p-4 flex flex-col gap-4 animate-pulse">
      <div className="flex justify-between items-start">
        <div className="w-2/3 space-y-3">
          <div className="h-4 bg-gray-700 rounded-full w-1/3"></div>
          <div className="h-5 bg-gray-700 rounded w-full"></div>
        </div>
        <div className="h-6 w-6 bg-gray-700 rounded-full"></div>
      </div>
      <div className="h-12 bg-gray-700/50 rounded-lg"></div>
      <div className="mt-auto space-y-2">
        <div className="flex justify-between">
          <div className="h-3 bg-gray-700 rounded-full w-1/4"></div>
          <div className="h-3 bg-gray-700 rounded-full w-1/3"></div>
        </div>
        <div className="h-2 bg-gray-700 rounded-full"></div>
        <div className="h-10 mt-4 bg-gray-700 rounded-lg"></div>
      </div>
    </div>
  );
};

export default GoalCardSkeleton;
