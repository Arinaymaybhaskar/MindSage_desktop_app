import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { useAuth } from "../../hooks/useAuth";
import { AuthLayout } from "../../layouts/AuthLayout";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import GoogleLoginElectron from "../../components/googleLoginElectron";
import { authService } from "../../api/authService";

export default function Login() {
  const [form, setForm] = useState({
    identifier: "",
    password: "",
    rememberMe: false,
  });
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<"online" | "offline">("offline");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      // Using the authService we defined earlier
      const res = await authService.login(authMode, {
        identifier: form.identifier,
        password: form.password,
      });
      console.log(res.userInfo)
      login(res.accessToken, res.userInfo, authMode);
      navigate("/");
    } catch (err: any) {
      console.log(err, "error");
      setError(err.message || "Invalid username or password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (response: any) => {
    console.log(response);
    setError("");
    setIsLoading(true);
    try {
      const res = await api.post("/auth/google-login", {
        response,
      });
      console.log(res);
      login(res.data.accessToken, res.data.userInfo, authMode);
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
      authMode={authMode}
      setAuthMode={setAuthMode}
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
            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
              authMode === "offline"
                ? "bg-blue-50 text-blue-700 border border-blue-300 rounded-l-lg hover:bg-blue-100"
                : "bg-purple-50 text-purple-700 border border-purple-300 rounded-r-lg hover:bg-purple-100"
            }`}
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </form>
      {authMode === "online" && (
        <GoogleLoginElectron
          onError={() => console.log("Error in google login")}
          onSuccess={handleGoogleSuccess}
        />
      )}

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
