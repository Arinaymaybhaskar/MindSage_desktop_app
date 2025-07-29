import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";
import GoogleLoginButton from "../components/GoogleLoginButton";
import { AuthLayout } from "../layouts/AuthLayout";
import { EyeIcon, EyeOffIcon } from "lucide-react";

export default function Login() {
  const [form, setForm] = useState({ identifier: "", password: "", rememberMe: false });
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const payload = { ...form, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      const res = await api.post("/auth/login", payload);
      login(res.data.accessToken, res.data.userInfo);
      navigate("/");
    } catch (err) {
      console.log(err, "error");
      setError("Invalid username or password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (
    response: google.accounts.id.CredentialResponse
  ) => {
    setError("");
    setIsLoading(true);
    try {
      const res = await api.post("/auth/google-login", {
        credential: response.credential,
      });
      login(res.data.accessToken, res.data.refreshToken);
      navigate("/");
    } catch (err) {
      console.error("Google login failed:", err);
      setError("Google login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue to your journal"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}
        <div>
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
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
              placeholder="Enter your username or email"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700"
          >
            Password
          </label>
          <div className="mt-1 relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
              placeholder="••••••••"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOffIcon className="h-5 w-5 text-gray-400" />
              ) : (
                <EyeIcon className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <input
              id="remember-me"
              name="remember-me"
              type="checkbox"
              checked={form.rememberMe}
              onChange={(e) =>
                setForm({ ...form, rememberMe: e.target.checked })
              }
              className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
            />
            <label
              htmlFor="remember-me"
              className="ml-2 block text-sm text-gray-900"
            >
              Remember me
            </label>
          </div>
          <div className="text-sm">
            <Link
              to="/forgot-password"
              className="font-medium text-teal-600 hover:text-teal-500"
            >
              Forgot your password?
            </Link>
          </div>
        </div>
        <div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </form>
      <GoogleLoginButton
        clientId={import.meta.env.VITE_O_AUTH_CLIENT_ID}
        onSuccess={handleGoogleSuccess}
      />
      <div className="mt-6 text-center text-sm">
        <span className="text-gray-600">Don't have an account?</span>{" "}
        <Link
          to="/register"
          className="font-medium text-teal-600 hover:text-teal-500"
        >
          Sign up
        </Link>
      </div>
    </AuthLayout>
  );
}
