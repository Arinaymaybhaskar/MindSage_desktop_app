import { type ReactNode } from "react";

// Resolve assets at build time
const authIconDark = new URL("../../assets/iconDark.png", import.meta.url).href;
const authIconLight = new URL("../../assets/iconLight.png", import.meta.url)
  .href;

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  /** Replaces the default blurb under the title. */
  subtitle?: ReactNode;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-base-light dark:bg-base-dark">
      {/* --- Themed decorative panel --- */}
      <div className="hidden w-1/2 md:flex bg-secondary-light dark:bg-secondary-dark p-8 flex-col justify-between">
        <div className="flex items-center gap-2 font-bold text-lg text-text-light font-display dark:text-text-dark">
          <img
            src={authIconLight}
            alt="MindSage Logo"
            className="w-8 h-8 hidden dark:block"
          />
          <img
            src={authIconDark}
            alt="MindSage Logo"
            className="w-8 h-8 dark:hidden"
          />
          <span className="flex">
            Mind<p className="font-medium">Sage</p>
          </span>
        </div>
        <div className="text-text-light dark:text-text-dark space-y-6 max-w-md">
          <h1 className="text-4xl font-bold font-display">
            Capture your thoughts, one day at a time.
          </h1>
          <p className="text-text-light-sub dark:text-text-dark-sub">
            Your personal space to reflect, grow, and document your journey
            through life.
          </p>
          <div className="flex gap-4 pt-2">
            <div className="h-1 w-12 bg-light1 dark:bg-dark1 rounded-full"></div>
            <div className="h-1 w-12 bg-success rounded-full"></div>
            <div className="h-1 w-12 bg-warning rounded-full"></div>
          </div>
        </div>
        <div className="text-text-light dark:text-text-dark-sub text-sm">
          © {new Date().getFullYear()} MindSage. All rights reserved.
        </div>
      </div>

      {/* --- Themed form panel --- */}
      <div className="w-full lg:w-1/2 md:w-1/2 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full">
          <div className="flex lg:hidden md:hidden justify-center items-center gap-2 mb-8">
            <img src={authIconDark} alt="MindSage Logo" className="w-8 h-8" />
            <p className="text-2xl font-display text-text-light dark:text-text-dark font-medium">
              <span className="font-bold">Mind</span>Sage
            </p>
          </div>

          <div className=" bg-secondary-light dark:bg-secondary-dark p-8 rounded-2xl shadow-lg border border-border-light dark:border-border-dark">
            <div className="mb-6">
              <h2 className="font-display text-2xl font-bold text-text-light dark:text-text-dark">
                {title}
              </h2>
              <p className="mt-2 text-sm text-text-light-sub dark:text-text-dark-sub">
                {subtitle ??
                  "Your data stays on this device, secure and private."}
              </p>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
