import { useState, useEffect, useRef } from "react";
import { Save, Upload, User as UserIcon, Loader2, X } from "lucide-react";
import Cropper from "react-easy-crop";

const ProfileSettings = ({ user, onProfileSave }) => {
  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    email: "",
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCropping, setIsCropping] = useState(false);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load image from electron
  const loadProfileImage = async (imagePath: string | null) => {
    if (!imagePath) {
      setPreviewSrc(null);
      return;
    }
    try {
      const dataUrl = await window.electron.ipcRenderer.invoke(
        "media:getImage",
        imagePath
      );
      setPreviewSrc(dataUrl || null);
    } catch (err) {
      console.error("Failed to load profile image via IPC:", err);
      setPreviewSrc(null);
    }
  };

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || "",
        username: user.username || "",
        email: user.email || "",
      });
      loadProfileImage(user.profile_picture);
    }
  }, [user]);

  // Input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // File select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewSrc(String(ev.target?.result));
      setIsCropping(true); // open cropping modal
    };
    reader.readAsDataURL(file);
  };

  // Remove image
  const handleRemoveImage = () => {
    setSelectedFile(null);
    setPreviewSrc(null);
  };

  // Utility: crop image to base64
  const getCroppedImg = (imageSrc: string, crop: any): Promise<string> => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.src = imageSrc;
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject("No 2D context");

        canvas.width = crop.width;
        canvas.height = crop.height;

        ctx.drawImage(
          image,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height
        );

        resolve(canvas.toDataURL("image/jpeg"));
      };
      image.onerror = reject;
    });
  };

  // Save profile
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let finalImagePath = user?.profile_picture ?? null;

      if (selectedFile && previewSrc) {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const res = await window.electron.ipcRenderer.invoke(
          "media:save-profile",
          {
            arrayBuffer,
            filename: selectedFile.name,
            userId: user?.id,
          }
        );
        finalImagePath = res?.path ?? finalImagePath;
      } else if (!previewSrc) {
        finalImagePath = null;
      }

      await onProfileSave({ ...formData, profile_picture: finalImagePath });
    } finally {
      setIsSaving(false);
      // Reload the page after saving profile
      window.location.reload();
    }
  };

  // CSS classes
  const inputClasses =
    "w-full p-2.5 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark focus:ring-2 focus:ring-info focus:border-info outline-none transition";
  const labelClasses =
    "block text-sm font-medium text-text-light dark:text-text-dark mb-1.5";

  return (
    <>
      {/* Cropping Modal */}
      {isCropping && previewSrc && (
        <div className="fixed inset-0 bg-base-dark/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl shadow-xl w-full max-w-lg border border-border-light dark:border-border-dark">
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
              Crop Your Photo
            </h3>
            <div className="relative w-full h-64">
              <Cropper
                image={previewSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, croppedAreaPixels) =>
                  setCroppedAreaPixels(croppedAreaPixels)
                }
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setIsCropping(false)}
                className="px-4 py-2 text-sm text-text-light dark:text-text-dark font-semibold bg-tertiary-light dark:bg-tertiary-dark rounded-lg hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!previewSrc || !croppedAreaPixels) return;
                  const cropped = await getCroppedImg(
                    previewSrc,
                    croppedAreaPixels
                  );
                  setPreviewSrc(cropped);
                  setIsCropping(false);
                }}
                className="px-4 py-2 text-sm font-semibold bg-light1 dark:bg-dark1 text-white rounded-lg hover:bg-light1 transition-colors flex items-center gap-2"
              >
                Crop & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Form */}
      <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
            Profile Information
          </h2>
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
            Update your account's profile details and avatar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Profile Picture */}
          <div>
            <label className={labelClasses}>Profile Picture</label>
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 rounded-full">
                <div className="group w-full h-full rounded-full relative">
                  <div className="w-full h-full rounded-full overflow-hidden bg-tertiary-light dark:bg-tertiary-dark flex items-center justify-center border border-border-light dark:border-border-dark">
                    {previewSrc ? (
                      <img
                        src={previewSrc}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserIcon className="w-10 h-10 text-text-light-sub dark:text-text-dark-sub" />
                    )}
                  </div>

                  {/* Upload overlay */}
                  <div
                    className="absolute inset-0 bg-base-dark/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={24} className="text-white" />
                  </div>
                </div>

                {/* ❌ Remove */}
                {previewSrc && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute -top-1 -right-1 bg-danger text-white p-1 rounded-full shadow-md hover:bg-danger/90 transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}

                {/* Hidden input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* Form Fields */}
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
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center justify-center gap-2 w-50 px-4 py-2 bg-light1 dark:bg-dark1 text-white font-semibold rounded-lg shadow-md hover:bg-light1 dark:bg-dark1/90 transition-all disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default ProfileSettings;
