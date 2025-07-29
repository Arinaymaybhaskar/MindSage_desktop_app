import { useState } from "react"

interface FollowUpQuestionProps {
  questions: string[]
}
export function FollowUpQuestions({ questions }: FollowUpQuestionProps) {
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null)
  return (
    <div className="mb-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-3 border border-indigo-100 shadow-sm animate-fadeIn">
      <h3 className="text-sm font-medium text-indigo-800 mb-2 flex items-center">
        <img src="../../public/ai.png" className="mr-2 w-4 h-4 text-indigo-600" />
        Follow-up Questions
      </h3>
      <div className="space-y-1.5">
        {questions.map((question, index) => (
          <div
            key={index}
            onClick={() =>
              setSelectedQuestion(selectedQuestion === index ? null : index)
            }
            className={`bg-white p-2.5 rounded-lg transition-all duration-300 cursor-pointer border ${selectedQuestion === index ? 'border-indigo-300 shadow-md transform-gpu -translate-y-0.5' : 'border-indigo-50 shadow-sm hover:shadow hover:border-indigo-200'}`}
          >
            <p className="text-sm text-gray-700">{question}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
