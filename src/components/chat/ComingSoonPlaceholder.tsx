import React from "react";
import { Sparkles } from "lucide-react";

export const ComingSoonPlaceholder: React.FC = () => {
  return (
    <div className="flex-grow flex flex-col items-center justify-center text-center p-8 bg-secondary-light dark:bg-secondary-dark">
      <div className="p-4 bg-info/10 rounded-full mb-4">
        <Sparkles size={32} className="text-info" />
      </div>
      <h3 className="text-xl font-bold text-text-light dark:text-text-dark">
        AI Insights are Coming Soon!
      </h3>
      <p className="max-w-sm mt-2 text-sm text-text-light-sub dark:text-text-dark-sub">
        We're putting the final touches on our new AI chat feature. Soon, you'll
        be able to ask questions and get powerful insights from your journal
        entries.
      </p>
    </div>
  );
};

export default ComingSoonPlaceholder;


