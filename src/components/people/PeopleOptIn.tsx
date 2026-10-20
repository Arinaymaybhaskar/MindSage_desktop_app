import { Users } from "lucide-react";

interface PeopleOptInProps {
  onEnable: () => void;
  busy?: boolean;
}

/**
 * The one screen shown before People is turned on: what it reads, where it
 * runs, and how to delete it. People stays off until the user says yes.
 */
export default function PeopleOptIn({ onEnable, busy }: PeopleOptInProps) {
  return (
    <div className="max-w-2xl mx-auto mt-10 p-8 rounded-2xl bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 rounded-xl bg-tertiary-light dark:bg-tertiary-dark">
          <Users size={24} />
        </div>
        <h2 className="font-display text-2xl font-semibold">People</h2>
      </div>
      <p className="text-text-light-sub dark:text-text-dark-sub mb-6">
        See the people you write about, how often they come up, and how you
        tended to feel when you wrote about them.
      </p>
      <ul className="space-y-3 text-sm mb-8">
        <li>
          <span className="font-semibold">What it reads.</span> Your journal
          entries. The local AI looks for people you know and the sentences
          about them.
        </li>
        <li>
          <span className="font-semibold">Where it runs.</span> On this computer
          only, with the same local AI as the rest of MindSage. Nothing is
          uploaded.
        </li>
        <li>
          <span className="font-semibold">You stay in charge.</span> The AI only
          suggests. Nobody is added until you say yes, and every line links back
          to the entry it came from so you can check it.
        </li>
        <li>
          <span className="font-semibold">How to delete it.</span> Delete any
          person, stop tracking someone, or turn People off and delete
          everything it worked out. Your entries are never changed.
        </li>
      </ul>
      <button
        onClick={onEnable}
        disabled={busy}
        className="px-5 py-2.5 bg-light1 dark:bg-dark1 text-white font-semibold rounded-lg shadow-md transition-all duration-200 hover:scale-105 disabled:opacity-60"
      >
        Turn on People
      </button>
    </div>
  );
}
