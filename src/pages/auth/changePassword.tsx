import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { userService } from "../../api/userService";
import { useAuth } from "../../hooks/useAuth";

const ChangePassword = () => {
  const navigate = useNavigate();
  const {accessToken} = useAuth();

  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  const [form, setForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState({
    old: false,
    new: false,
    confirm: false,
  });

  const [error, setError] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [invalidOldPassword, setInvalidOldPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setInvalidOldPassword(false); // reset on change
  };

  const toggleVisibility = (field: "old" | "new" | "confirm") => {
    setShowPassword({ ...showPassword, [field]: !showPassword[field] });
  };

  const handleSubmit = async () => {
    if (form.newPassword !== form.confirmPassword) {
      return setError("New passwords do not match");
    }

    try {
      const payload = {
        old_password: form.oldPassword,
        new_password: form.newPassword,
      };
      await userService.changePassword(authMode, accessToken!, payload)

      alert("Password updated successfully.");
      navigate("/settings");
    } catch (err) {
      console.error(err);
      setError("Failed to change password. Please check your old password.");
      setInvalidOldPassword(true);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 px-4">
      <h1 className="text-2xl font-semibold mb-6 text-center text-gray-800">
        Change Password
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setShowDialog(true);
        }}
        className="space-y-6 bg-white p-6 rounded-xl shadow-md border border-gray-200"
      >
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {/* Old Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Old Password
          </label>
          <div className="relative">
            <input
              type={showPassword.old ? "text" : "password"}
              name="oldPassword"
              value={form.oldPassword}
              onChange={handleChange}
              required
              className={`w-full border ${
                invalidOldPassword ? "border-red-500" : "border-gray-300"
              } rounded-md p-2 pr-10 focus:ring-indigo-500 focus:border-indigo-500`}
            />
            <button
              type="button"
              className="absolute right-2 top-2"
              onClick={() => toggleVisibility("old")}
              tabIndex={-1}
            >
              {showPassword.old ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New Password
          </label>
          <div className="relative">
            <input
              type={showPassword.new ? "text" : "password"}
              name="newPassword"
              value={form.newPassword}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded-md p-2 pr-10 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="button"
              className="absolute right-2 top-2"
              onClick={() => toggleVisibility("new")}
              tabIndex={-1}
            >
              {showPassword.new ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confirm New Password
          </label>
          <div className="relative">
            <input
              type={showPassword.confirm ? "text" : "password"}
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              required
              className={`w-full border ${
            form.newPassword && form.confirmPassword && form.newPassword !== form.confirmPassword
              ? "border-red-500"
              : "border-gray-300"
              } rounded-md p-2 pr-10 focus:ring-indigo-500 focus:border-indigo-500`}
            />
            <button
              type="button"
              className="absolute right-2 top-2"
              onClick={() => toggleVisibility("confirm")}
              tabIndex={-1}
            >
              {showPassword.confirm ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
            </button>
          </div>
          {form.newPassword && form.confirmPassword && form.newPassword !== form.confirmPassword && (
            <p className="text-red-600 text-xs mt-1">Passwords do not match</p>
          )}
        </div>

        <button
          type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-md font-medium"
        >
          Update Password
        </button>
      </form>

      {/* Confirmation Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-white/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-4">Confirm Change</h2>
            <p className="mb-6">Are you sure you want to change your password?</p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowDialog(false)}
                className="px-4 py-2 rounded-md border border-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDialog(false);
                  handleSubmit();
                }}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChangePassword;
