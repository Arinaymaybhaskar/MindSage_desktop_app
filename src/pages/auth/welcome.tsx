import { Link } from "react-router-dom";
import { AuthLayout } from "../../layouts/AuthLayout";

/**
 * First run, before any profile exists. One primary action; restoring a
 * backup is a quiet link that creates a profile first, because an import
 * needs a signed-in journal to land in.
 */
export default function Welcome() {
  return (
    <AuthLayout
      title="Welcome to MindSage"
      subtitle="A private journal that stays on this computer. Your entries and the AI that reflects on them never leave it."
    >
      <div className="space-y-5">
        <Link
          to="/register"
          className="w-full flex justify-center py-2.5 px-4 rounded-md shadow-sm text-sm font-medium text-white bg-light1 dark:bg-dark1 transition-colors"
        >
          Get started
        </Link>
        <p className="text-xs text-center text-text-light-sub dark:text-text-dark-sub">
          MindSage is for adults aged 18 and over. It is a journaling tool, not
          therapy or medical care.
        </p>
        <p className="text-center text-sm text-text-light-sub dark:text-text-dark-sub">
          Moving from another computer?{" "}
          <Link
            to="/register"
            state={{ restore: true }}
            className="font-medium underline text-dark1 dark:text-light1"
          >
            Restore from a backup
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
