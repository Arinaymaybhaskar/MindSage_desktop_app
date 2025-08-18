// src/components/EmptyState.tsx
import React from "react";

interface EmptyStateProps {
  Icon: React.ElementType;
  title: string;
  message: string;
  action?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  Icon,
  title,
  message,
  action,
}) => {
  return (
    <div className="text-center bg-gray-800/50 border-2 border-dashed border-gray-700 rounded-xl p-12 my-4">
      <Icon className="mx-auto h-12 w-12 text-gray-500" />
      <h3 className="mt-2 text-lg font-semibold text-gray-200">{title}</h3>
      <p className="mt-1 text-sm text-gray-400">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
};

export default EmptyState;
