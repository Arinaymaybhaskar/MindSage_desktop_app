import { Link } from "react-router-dom";
import { ArrowLeftIcon, KeyRound } from "lucide-react";
import { AuthLayout } from "../../layouts/AuthLayout";

/**
 * MindSage stores everything on this device and talks to no account server,
 * so there is nothing that can email a reset link or verify a one-time code.
 *
 * This screen used to POST to /auth/forgot-password and /auth/verify-otp on a
 * server that never starts, so the OTP never arrived and the only thing the
 * user ever saw was a network error. Saying plainly that recovery does not
 * exist is more use than a form that cannot work. See
 * docs/OFFLINE_AUTH_DESIGN.md, which rejects email reset outright and
 * describes the recovery-code flow intended to replace this.
 */
const ForgotPassword = () => {
  return (
    <AuthLayout
      title="Password recovery"
      subtitle="There is no account server to reset a password through"
    >
      <div className="w-full max-w-md space-y-6 bg-surface-light dark:bg-surface-dark p-8 rounded-lg">
        <Link
          to="/login"
          className="text-sm flex items-center text-text-light-sub dark:text-text-dark-sub hover:text-dark1 dark:hover:text-light1 transition-colors"
        >
          <ArrowLeftIcon size={16} className="mr-2" />
          Back to sign in
        </Link>

        <div className="flex items-start gap-3 p-4 rounded-md bg-warning/10">
          <KeyRound
            size={20}
            className="mt-0.5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div className="space-y-3 text-sm text-text-light dark:text-text-dark">
            <p>
              Your journal lives on this computer and nowhere else. MindSage has
              no account server, so there is no address to send a reset link to
              and no one who can verify your identity for you.
            </p>
            <p>
              That means a forgotten password cannot be reset from this screen.
              It is the trade that keeps your entries off someone else&apos;s
              machine.
            </p>
          </div>
        </div>

        <div className="space-y-3 text-sm text-text-light-sub dark:text-text-dark-sub">
          <p>
            If you can still sign in, you can change your password from Settings
            at any time.
          </p>
          <p>
            If you cannot, your journal file stays where it is on disk. Nothing
            is deleted, and creating a new account here does not overwrite it.
          </p>
        </div>

        <Link
          to="/login"
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-light1 dark:bg-dark1 hover:brightness-110 transition"
        >
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  );
};

export default ForgotPassword;
