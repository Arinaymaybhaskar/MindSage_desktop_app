import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { AuthLayout } from "../layouts/AuthLayout";
import { EyeIcon, EyeOffIcon, InfoIcon } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import GoogleLoginButton from "../components/GoogleLoginButton";

export default function Register() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    full_name: "",
  });
  const [usernameAvailable, setUsernameAvailable] = useState<null | boolean>(
    null
  );
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [usernameChecking, setUsernameChecking] = useState(false);
  const { login } = useAuth();
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  useEffect(() => {
    if (!form.username) {
      setUsernameAvailable(null);
      return;
    }

    setUsernameChecking(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const res = await api.post("/auth/check-username", {
          username: form.username,
        });
        if (res.status === 200) {
          setUsernameAvailable(true);
        }
      } catch (err: any) {
        if (err.response?.status === 409) {
          setUsernameAvailable(false);
        } else {
          setUsernameAvailable(null);
          console.error("Username check error:", err);
        }
      } finally {
        setUsernameChecking(false);
      }
    }, 1000); // 1s debounce

    return () => clearTimeout(delayDebounce);
  }, [form.username]);

  const handleSubmit = async (e: React.FormEvent) => {
    if (usernameError || !usernameAvailable) {
      setError("Please fix username issues before submitting.");
      return;
    }
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await api.post("/auth/register", form);
      navigate("/login");
    } catch (err) {
      console.log(err);
      setError("Registration failed. Try different username/email.");
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

  const handleUserNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
    setForm({ ...form, username: value });

    if (value.length < 3) {
      setUsernameError("Username must be at least 3 characters.");
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameError("Only letters, numbers, and underscores allowed.");
      return;
    }

    setUsernameError(null); // valid
  };

  return (
    <AuthLayout title="Register" subtitle="Create a new account">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}
        <div>
          <label
            htmlFor="full_name"
            className="block text-sm font-medium text-gray-700"
          >
            Full Name
          </label>
          <input
            name="full_name"
            id="full_name"
            type="text"
            required
            placeholder="Enter your full name"
            onChange={handleChange}
            value={form.full_name}
            className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="username"
            className=" text-sm font-medium items-center flex text-gray-700"
          >
            Username
            <div className="relative group">
              <InfoIcon size={14} className="ml-1" />
              <div className="absolute z-10 hidden group-hover:block bottom-full mb-1 w-max bg-white text-gray-700 text-xs rounded px-3 py-3 shadow-2xl">
                <p className="font-semibold mb-1">Username can include:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Letters (A–Z, a–z)</li>
                  <li>Numbers (0–9)</li>
                  <li>Underscores (_)</li>
                </ul>
              </div>
            </div>
          </label>
          <input
            name="username"
            id="username"
            type="text"
            required
            placeholder="Enter a username"
            onChange={handleUserNameChange}
            value={form.username}
            className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
          />
          {form.username && (
            <div className="mt-1 text-sm">
              {usernameError ? (
                <span className="text-red-600">{usernameError}</span>
              ) : usernameChecking ? (
                <span className="text-gray-500">Checking availability...</span>
              ) : usernameAvailable === true ? (
                <span className="text-green-600">Username is available</span>
              ) : usernameAvailable === false ? (
                <span className="text-red-600">Username already taken</span>
              ) : null}
            </div>
          )}
        </div>
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700"
          >
            Email
          </label>
          <input
            name="email"
            id="email"
            type="text"
            required
            placeholder="Enter your email"
            onChange={handleChange}
            value={form.email}
            className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
          />
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
              name="password"
              id="password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="Create a password"
              onChange={handleChange}
              value={form.password}
              className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
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
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Creating account" : "Register"}
        </button>
      </form>
      <GoogleLoginButton
        clientId={import.meta.env.VITE_O_AUTH_CLIENT_ID}
        onSuccess={handleGoogleSuccess}
      />
      <div className="mt-6 text-center text-sm">
        <span className="text-gray-600">Already have an account? </span>
        <Link
          to="/login"
          className="font-medium text-emerald-600 hover:text-emerald-500"
        >
          Login
        </Link>
      </div>
    </AuthLayout>
  );
}
