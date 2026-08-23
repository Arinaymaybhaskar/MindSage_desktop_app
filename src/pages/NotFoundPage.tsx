import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Compass, Home } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect } from "react";

const NotFoundPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The app runs on a HashRouter. This previously did
      // `window.location.href = "/dashboard"`, which walks the renderer off the
      // app entry altogether - a dead page in the packaged build, where the
      // document is loaded over file:// and there is no /dashboard to serve.
      if (event.key === "Enter") navigate("/dashboard");
      if (event.key === "Escape") navigate(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return (
    <div className="relative bg-base-light dark:bg-base-dark min-h-[calc(100vh-40px)] flex items-center justify-center overflow-hidden px-6 text-center">
      {/* Soft pool of light behind the content, so the composition has a centre
          instead of floating in flat black. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-light1/20 dark:bg-dark1/25 blur-[120px]"
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex flex-col items-center"
      >
        {/* The original drew a huge "404" in `secondary-dark` on `base-dark` -
            hsl 9% over hsl 5% - so it was invisible. Making it visible then
            put it straight through the heading, so the code is now the small
            piece of information it actually is, and the sentence is the hero. */}
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.4 }}
          className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark shadow-sm"
        >
          <Compass
            size={26}
            className="text-text-light-sub dark:text-text-dark-sub"
          />
        </motion.div>

        <span className="mb-3 rounded-full border border-border-light dark:border-border-dark px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-text-light-sub dark:text-text-dark-sub">
          404 · not found
        </span>

        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-text-light dark:text-text-dark">
          This page wandered off
        </h1>

        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-text-light-sub dark:text-text-dark-sub">
          The address you followed doesn't lead anywhere in MindSage. Your
          entries are safe; nothing has been lost.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-dark1 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90"
          >
            <Home size={16} />
            Go to dashboard
          </Link>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-xl border border-border-light dark:border-border-dark px-5 py-2.5 text-sm font-medium text-text-light-sub dark:text-text-dark-sub transition-colors hover:bg-tertiary-light dark:hover:bg-tertiary-dark hover:text-text-light dark:hover:text-text-dark"
          >
            <ArrowLeft size={16} />
            Go back
          </button>
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-[11px] text-text-light-sub/70 dark:text-text-dark-sub/70">
          <kbd className="rounded border border-border-light dark:border-border-dark px-1.5 py-0.5">
            ↵
          </kbd>
          dashboard
          <span className="mx-1 opacity-40">·</span>
          <kbd className="rounded border border-border-light dark:border-border-dark px-1.5 py-0.5">
            esc
          </kbd>
          back
        </p>
      </motion.div>
    </div>
  );
};

export default NotFoundPage;
