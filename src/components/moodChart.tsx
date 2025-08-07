// src/components/MoodChart.tsx
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { useEffect, useState } from "react";
import journalService from "../api/journalService";

type MoodEntry = {
  created_at: string;
  mood_score: number;
};

interface TooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-white shadow-lg border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-800">
      <div className="font-semibold text-indigo-600">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-gray-600">Mood:</span>
        <span className="text-indigo-500 font-medium text-base">
          {payload[0].value}
        </span>
      </div>
    </div>
  );
};

export const MoodChart = () => {
  const [data, setData] = useState<MoodEntry[]>([
    {
      created_at: "",
      mood_score: 0,
    },
  ]);
  const [range, setRange] = useState<7 | 30>(7);

  useEffect(() => {
    const fetchData = async () => {
      journalService.getMoodRange(range).then((res) => {
        setData(res.data);
      });
    };
    fetchData();
  }, [range]);

  const formattedData = Array.isArray(data)
    ? data.map((entry) => ({
        date: new Date(entry.created_at).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        }),
        mood: entry.mood_score,
      }))
    : [];

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-700">Mood Over Time</h2>
        <select
          value={range}
          onChange={(e) => setRange(Number(e.target.value) as 7 | 30)}
          className="border border-gray-300 rounded-md text-sm px-2 py-1"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={formattedData}>
          {/* X Axis without labels/ticks/line */}
          <XAxis dataKey="date" tick={false} />

          {/* Y Axis without labels/ticks/line */}
          <YAxis domain={[1, 5]} tick={false} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="mood"
            stroke="#3b82f6"
            strokeWidth={2}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
