import React, { useState } from "react";
import api from "../../api/axios";
import { AuthLayout } from "../../layouts/AuthLayout";
import OTPInput from "../../components/ui/OTPInput";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { ArrowLeftIcon } from "lucide-react";

const ForgotPassword = () => {
  const [form, setForm] = useState({ identifier: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [otp, setOtp] = useState<number | null>();

  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.post("/auth/forgot-password", { identifier: form.identifier });
      setSuccess(true);
      setError("");
    } catch (error) {
      setError("Failed to send password reset email.");
      console.error("Error sending password reset email:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPSubmit = async () => {
    setIsLoading(true);
    try {
      const res = await api.post("/auth/verify-otp", { otp: otp, identifier: form.identifier });
      login(res.data.accessToken, res.data.userInfo);
      navigate("/");
      setError("");
    } catch (error) {
      setError("Wrong OTP");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot Password"
      subtitle="Enter your email to reset your password"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-md bg-green-50 text-green-700 text-sm">
            An OTP has been sent to your email.
          </div>
        )}
        <Link to={"/login"} className="text-sm flex justify-start items-center">
          <ArrowLeftIcon size={16} className="mr-2" />
          Back to Login
        </Link>
        <div>
          {success ? (
            <>
              <label
                htmlFor="otp"
                className="block mb-2 text-sm font-medium text-gray-700"
              >
                Enter OTP
              </label>
              <OTPInput
                length={6}
                onChange={(value) => setOtp(Number(value))}
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading}
                className="mt-2"
              >
                Didn't receive the OTP?{" "}
                <span className="ml-2 underline italic cursor-pointer">
                  Resend
                </span>
              </button>
            </>
          ) : (
            <>
              <label
                htmlFor="identifier"
                className="block text-sm font-medium text-gray-700"
              >
                Username or Email
              </label>
              <div className="mt-1">
                <input
                  id="identifier"
                  name="identifier"
                  autoComplete="identifier"
                  required
                  value={form.identifier}
                  onChange={(e) =>
                    setForm({ ...form, identifier: e.target.value })
                  }
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                  placeholder="Enter your username or email"
                />
              </div>
            </>
          )}
        </div>
        <div>
          {success ? (
            <>
              <button
                type="button"
                onClick={handleOTPSubmit}
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Submitting..." : "Submit"}
              </button>
            </>
          ) : (
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Sending..." : "Send OTP"}
            </button>
          )}
        </div>
      </form>
    </AuthLayout>
  );
};

export default ForgotPassword;
