import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftIcon, LoaderCircle } from "lucide-react";
import api from "../../api/axios";
import { useAuth } from "../../hooks/useAuth";
import { AuthLayout } from "../../layouts/AuthLayout";
import OTPInput from "../../components/ui/OTPInput";

// Animation variants for smooth transitions
const formVariants = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -50 },
};

const ForgotPassword = () => {
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [isOTPSent, setIsOTPSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSendOTP = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { identifier });
      setIsOTPSent(true);
    } catch (err) {
      console.error("Failed to send OTP:", err);
      setError("Failed to send OTP. Please check the email or username.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      setError("Please enter a 6-digit OTP.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/verify-otp", { otp, identifier });
      login(res.data.accessToken, res.data.userInfo, "online");
      navigate("/");
    } catch (err) {
      console.error("OTP verification failed:", err);
      setError("Invalid OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot Password"
      subtitle="Enter your details to reset your password"
    >
      <div className="w-full max-w-md space-y-6 bg-surface-dark p-8 rounded-lg">
        {/* Animated error message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 rounded-md bg-danger/10 text-danger text-sm text-center"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Back to Login Link */}
        <Link
          to={"/login"}
          className="text-sm flex items-center text-text-dark-sub hover:text-dark1 dark:text-light1 transition-colors"
        >
          <ArrowLeftIcon size={16} className="mr-2" />
          Back to Login
        </Link>

        {/* Form area with animated transitions */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isOTPSent) handleVerifyOTP();
            else handleSendOTP();
          }}
          className="space-y-6"
        >
          <AnimatePresence mode="wait">
            {!isOTPSent ? (
              // --- Step 1: Email/Identifier Input ---
              <motion.div
                key="identifier"
                variants={formVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="identifier"
                    className="block text-sm font-medium text-text-dark"
                  >
                    Username or Email
                  </label>
                  <div className="mt-1">
                    <input
                      id="identifier"
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full px-3 py-2 bg-secondary-dark border border-border-dark rounded-md shadow-sm placeholder-text-dark-sub text-text-dark focus:outline-none focus:ring-2 focus:ring-info focus:border-info sm:text-sm"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ scale: 1.02, filter: "brightness(1.1)" }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-text-dark bg-light1 dark:bg-dark1 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-dark focus:ring-info disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    "Send OTP"
                  )}
                </motion.button>
              </motion.div>
            ) : (
              // --- Step 2: OTP Input ---
              <motion.div
                key="otp"
                variants={formVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div className="p-3 rounded-md bg-success/10 text-success text-sm text-center">
                  An OTP has been sent to your email.
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium text-text-dark">
                    Enter OTP
                  </label>
                  <OTPInput length={6} onChange={setOtp} />
                  <div className="text-right mt-2">
                    <button
                      type="button"
                      onClick={() => handleSendOTP()}
                      disabled={isLoading}
                      className="text-sm text-dark1 dark:text-light1 hover:underline disabled:opacity-50"
                    >
                      Resend OTP
                    </button>
                  </div>
                </div>
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ scale: 1.02, filter: "brightness(1.1)" }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-text-dark bg-light1 dark:bg-dark1 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-dark focus:ring-info disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    "Verify & Reset"
                  )}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>
    </AuthLayout>
  );
};

export default ForgotPassword;
