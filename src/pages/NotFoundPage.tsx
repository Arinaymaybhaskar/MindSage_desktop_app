import { Link } from "react-router-dom";
import { Compass, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect } from "react";

const NotFoundPage = () => {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      window.location.href = "/dashboard";
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="bg-base-light dark:bg-base-dark min-h-[calc(100vh-40px)] flex items-center justify-center text-center px-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative"
      >
        {/* Decorative background number */}
        <p
          className="absolute inset-0 text-[12rem] sm:text-[16rem] md:text-[20rem] font-black text-secondary-light dark:text-secondary-dark -z-10 -translate-y-1/4"
          aria-hidden="true"
        >
          404
        </p>

        <div className="relative z-10 flex flex-col items-center">
          <div className="p-4 bg-info/10 rounded-full mb-4">
            <Compass size={48} className="text-info" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-text-light dark:text-text-dark">
            Page Not Found
          </h1>
          <p className="mt-4 max-w-md text-lg text-text-light-sub dark:text-text-dark-sub">
            Sorry, the page you are looking for doesn't exist or has been moved.
            Let's get you back on track.
          </p>
          <Link
            to="/dashboard"
            className="mt-8 inline-flex items-center gap-2 px-6 py-3 bg-info text-white font-semibold rounded-lg shadow-md hover:bg-info/90 transition-all transform hover:scale-105"
          >
            <ArrowLeft size={18} />
            Go to Dashboard
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFoundPage;
