import { useState } from "react";

interface FollowUpQuestionProps {
  questions: string[];
}
export function FollowUpQuestions({ questions }: FollowUpQuestionProps) {
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);
  return (
    <div
      className="mb-3 bg-gradient-to-r 
            from-indigo-50 via-pink-50 to-purple-50 
            dark:from-indigo-950 dark:via-pink-950 dark:to-purple-950 rounded-xl p-3 shadow-sm animate-fadeIn"
    >
      <h3 className="text-sm font-medium mb-2 text-white flex items-center">
        <img src="../../public/ai.png" className="mr-2 w-4 h-4 dark:hidden" />
        <img
          src="../../public/ai-white.png"
          alt=""
          className="mr-2 w-4 h-4  dark:block"
        />
        Follow-up Questions
      </h3>
      <div className="space-y-1.5">
        {questions.map((question, index) => (
          <div
            key={index}
            onClick={() =>
              setSelectedQuestion(selectedQuestion === index ? null : index)
            }
            className={`bg-base-light dark:bg-base-dark  p-2.5 rounded-lg transition-all duration-300 border border-border-light dark:border-border-dark ${
              selectedQuestion === index
                ? "border-indigo-300 shadow-md transform-gpu -translate-y-0.5"
                : "border-indigo-50 shadow-sm"
            }`}
          >
            <p className="text-sm ">{question}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
