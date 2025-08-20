import { useState, useEffect } from "react";
import { Save } from "lucide-react";

const ProfileSettings = ({ user, onProfileSave }) => {
  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    email: "",
  });

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || "",
        username: user.username || "",
        email: user.email || "",
      });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onProfileSave(formData);
  };

  // --- CHANGE: Themed input styling ---
  const inputClasses =
    "w-full p-2.5 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark outline-none transition";
  const labelClasses =
    "block text-sm font-medium text-text-light dark:text-text-dark mb-1.5";

  return (
    // --- CHANGE: Themed main container ---
    <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
      <div className="p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
          Profile Information
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Update your account's profile details.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Full Name */}
        <div>
          <label htmlFor="full_name" className={labelClasses}>
            Full Name
          </label>
          <input
            type="text"
            name="full_name"
            id="full_name"
            value={formData.full_name}
            onChange={handleChange}
            className={inputClasses}
          />
        </div>

        {/* Username */}
        <div>
          <label htmlFor="username" className={labelClasses}>
            Username
          </label>
          <input
            type="text"
            name="username"
            id="username"
            value={formData.username}
            onChange={handleChange}
            className={inputClasses}
          />
        </div>

        {/* Email Address */}
        <div>
          <label htmlFor="email" className={labelClasses}>
            Email Address
          </label>
          <input
            type="email"
            name="email"
            id="email"
            value={formData.email}
            onChange={handleChange}
            className={inputClasses}
          />
        </div>

        <div className="flex justify-end pt-2">
          {/* --- CHANGE: Themed save button --- */}
          <button
            type="submit"
            className="flex items-center gap-2 px-4 py-2 bg-info text-white font-semibold rounded-lg shadow-md hover:bg-info/90 transition-all"
          >
            <Save size={16} /> Save Changes
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProfileSettings;
