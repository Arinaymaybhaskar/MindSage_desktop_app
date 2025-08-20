import React, { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import Modal from "../../Modal";
import type { Goal, ProgressLog } from "../../../types/Goals";

interface ReflectionGoal extends Goal {
  progressLogs: ProgressLog[];
}

const ReflectionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  goal: ReflectionGoal;
}> = ({ isOpen, onClose, goal }) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (isOpen && chartRef.current && goal.progressLogs) {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      const ctx = chartRef.current.getContext("2d");
      if (!ctx) return;

      // --- CHANGE: Use theme colors for the chart ---
      const isDarkMode =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      const gridColor = isDarkMode ? "hsl(0, 0%, 30%)" : "hsl(0, 0%, 70%)";
      const textColor = isDarkMode ? "hsl(0, 0%, 70%)" : "hsl(0, 0%, 30%)";
      const themeColor = "hsl(238, 52%, 70%)"; // --color-info

      const startDate = new Date(goal.created_at);
      const chartData = {
        labels: [
          startDate.toLocaleDateString(),
          ...goal.progressLogs.map((log) =>
            new Date(log.logged_at).toLocaleDateString()
          ),
        ],
        datasets: [
          {
            label: `Progress (${goal.unit})`,
            data: [0, ...goal.progressLogs.map((log) => log.value)],
            borderColor: themeColor,
            backgroundColor: "hsla(238, 52%, 70%, 0.1)",
            tension: 0.2,
            fill: true,
            pointBackgroundColor: themeColor,
            pointBorderColor: "#fff",
            pointHoverRadius: 6,
          },
        ],
      };

      chartInstance.current = new Chart(ctx, {
        type: "line",
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: { color: textColor },
            },
            x: {
              grid: { display: false },
              ticks: { color: textColor },
            },
          },
          plugins: {
            legend: {
              labels: { color: textColor },
            },
          },
        },
      });
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [isOpen, goal]);

  const startDate = new Date(goal.created_at);
  const endDate = goal.completed_date
    ? new Date(goal.completed_date)
    : new Date();
  const duration = Math.round(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Reflection: ${goal.title}`}
      size="lg"
    >
      {/* --- CHANGE: Themed stats section --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-8 p-4 bg-secondary-light dark:bg-secondary-dark rounded-lg">
        <div>
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
            Started On
          </p>
          <p className="font-bold text-lg text-text-light dark:text-text-dark">
            {startDate.toLocaleDateString()}
          </p>
        </div>
        <div>
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
            Completed On
          </p>
          <p className="font-bold text-lg text-text-light dark:text-text-dark">
            {goal.completed_date ? endDate.toLocaleDateString() : "In Progress"}
          </p>
        </div>
        <div>
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
            Duration
          </p>
          <p className="font-bold text-lg text-text-light dark:text-text-dark">{`${duration} days`}</p>
        </div>
      </div>
      {/* --- CHANGE: Sized container for the chart --- */}
      <div className="relative h-72">
        <canvas ref={chartRef}></canvas>
      </div>
    </Modal>
  );
};

export default ReflectionModal;
