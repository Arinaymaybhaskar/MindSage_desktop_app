import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { aiFeaturesService } from "../api/aiFeaturesService";
import { helloAvailable } from "../api/helloService";
import { userService } from "../api/userService";

const SAVE_FAILED = "Could not save that. Please try again.";

/** Last setup screen (KAN-81). Each toggle saves the moment it changes. */
export default function YoureSet() {
  const navigate = useNavigate();
  const [reminder, setReminder] = useState(false);
  const [time, setTime] = useState("20:00");
  const [suggestions, setSuggestions] = useState(true);
  const [hello, setHello] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    userService
      .getSettings()
      .then((s) => {
        setReminder(!!s.journal_reminder);
        setTime(s.reminder_time || "20:00");
      })
      .catch(() => {});
    aiFeaturesService
      .get()
      .then((f) => f && setSuggestions(f.suggestions))
      .catch(() => {});
    helloAvailable().then(setHello);
  }, []);

  const saveReminder = (patch: {
    journal_reminder?: boolean;
    reminder_time?: string;
  }) =>
    userService
      .updateSettings(patch)
      .then(() => setError(""))
      .catch(() => setError(SAVE_FAILED));

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="text-2xl font-bold">You're set</h1>
      <p className="mt-2 text-sm">Change any of this later in Settings.</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <label className="mt-6 flex items-center gap-3">
        <input
          type="checkbox"
          checked={reminder}
          onChange={(e) => {
            setReminder(e.target.checked);
            void saveReminder({ journal_reminder: e.target.checked });
          }}
        />
        Remind me to write each day
      </label>
      {reminder && (
        <label className="mt-3 flex items-center gap-3">
          Reminder time
          <input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              if (e.target.value)
                void saveReminder({ reminder_time: e.target.value });
            }}
          />
        </label>
      )}

      <label className="mt-4 flex items-center gap-3">
        <input
          type="checkbox"
          checked={suggestions}
          onChange={(e) => {
            setSuggestions(e.target.checked);
            aiFeaturesService
              .set("suggestions", e.target.checked)
              .catch(() => setError(SAVE_FAILED));
          }}
        />
        Suggest prompts and ideas while I write
      </label>

      {hello && (
        <label className="mt-4 flex items-center gap-3">
          <input type="checkbox" />
          Unlock with Windows Hello
        </label>
      )}

      <button
        type="button"
        onClick={() => navigate("/", { replace: true })}
        className="mt-8 rounded-lg bg-dark1 px-6 py-2.5 font-semibold text-white dark:bg-light1 dark:text-dark1"
      >
        Continue
      </button>
    </div>
  );
}
