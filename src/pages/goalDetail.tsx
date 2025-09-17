import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { goalService } from "../api/goalService";
import { useAuth } from "../hooks/useAuth";
import { ArrowLeft, Flag, CheckCircle, Calendar } from "lucide-react";

export default function GoalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const { accessToken } = useAuth();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const goal = await goalService.getGoalById(
          authMode,
          accessToken!,
          Number(id)
        );
        setData(goal);
      } catch (error) {
        console.error(error, "Error fetching goal details");
      }
    };
    fetchData();
  }, [id, authMode, accessToken]);

  if (!data)
    return (
      <p className="text-center text-text-light dark:text-text-dark">
        Loading...
      </p>
    );

  const progress = Math.round((data.current_value / data.target_value) * 100);

  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark p-6">
      {/* Back button */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/goals")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary-light dark:bg-secondary-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition"
        >
          <ArrowLeft size={18} />
          Back to Goals
        </button>
      </div>

      <div className="max-w-4xl mx-auto space-y-8">
        {/* Goal Header Card */}
        <div className="p-8 rounded-2xl shadow bg-surface-light dark:bg-secondary-dark border border-border-light dark:border-border-dark">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h1 className="text-3xl font-bold">{data.title}</h1>
            <span
              className="px-3 py-1 rounded-full text-sm font-medium"
              style={{ backgroundColor: data.category?.color || "#ccc" }}
            >
              {data.category?.name}
            </span>
          </div>
          <p className="mt-2 text-text-light-sub dark:text-text-dark-sub">
            {data.description}
          </p>

          <div className="mt-6 flex flex-wrap gap-6 text-sm text-text-light-sub dark:text-text-dark-sub">
            <div className="flex items-center gap-2">
              <Calendar size={16} />
              Target Date: {new Date(data.target_date).toLocaleDateString()}
            </div>
            <div className="flex items-center gap-2">
              <Flag size={16} />
              Target: {data.target_value} {data.unit}
            </div>
            {data.is_completed ? (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle size={16} />
                Completed
              </div>
            ) : (
              <div className="flex items-center gap-2 text-dark1 dark:text-light1">
                <CheckCircle size={16} />
                In Progress
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="mt-6">
            <div className="flex justify-between text-sm mb-2">
              <span>
                {data.current_value} / {data.target_value} {data.unit}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-4 rounded-full bg-tertiary-light dark:bg-tertiary-dark overflow-hidden">
              <div
                className="h-full rounded-full bg-light1 dark:bg-dark1 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Logs Section */}
        <div className="p-8 rounded-2xl shadow bg-surface-light dark:bg-secondary-dark border border-border-light dark:border-border-dark">
          <h2 className="text-xl font-semibold mb-4">Progress Logs</h2>
          {data.logs && data.logs.length > 0 ? (
            <ul className="space-y-4">
              {data.logs.map((log: any) => (
                <li
                  key={log.id}
                  className="p-4 rounded-xl bg-secondary-light dark:bg-tertiary-dark hover:bg-tertiary-light dark:hover:bg-base-dark transition"
                >
                  <p className="text-sm">{log.description}</p>
                  <div className="flex justify-between mt-2 text-xs text-text-light-sub dark:text-text-dark-sub">
                    <span>
                      +{log.value} {data.unit}
                    </span>
                    <span>{new Date(log.logged_at).toLocaleDateString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              No logs yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
