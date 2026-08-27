import React from "react";

interface ChatWelcomeProps {
  greeting: string;
  prompt: string;
}

export const ChatWelcome: React.FC<ChatWelcomeProps> = ({
  greeting,
  prompt,
}) => {
  return (
    <div className="text-center mb-10">
      <h1 className="font-display text-3xl font-bold">{greeting}</h1>
      <p className="text-lg text-text-light-sub dark:text-text-dark-sub">
        {prompt}
      </p>
    </div>
  );
};
