import { useState, useRef, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

// Define the interface for a single data point for type safety
interface DataPoint {
  mood_score: number | null;
  created_at: string;
  sentiment_score: number;
}

// Define the custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-3 bg-[#262626] border border-gray-600 rounded-lg shadow-lg">
        {/* Big font for the date (label) */}
        <p className="text-lg font-bold text-gray-50 mb-2">{label}</p>

        {/* Small font for the data points (payload) */}
        <div className="text-sm">
          <p style={{ color: payload[0].color }}>
            {`${payload[0].name} : ${payload[0].value.toFixed(2)}`}
          </p>
          <p style={{ color: payload[1].color }}>
            {`${payload[1].name} : ${payload[1].value.toFixed(2)}`}
          </p>
        </div>
      </div>
    );
  }

  return null;
};

/**
 * A chart component to display mood and sentiment scores over time.
 */
function MoodSentimentChart({
  data,
}: {
  data: DataPoint[] | null | undefined;
}) {
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState("Monthly");
  const rangeDropdownRef = useRef<HTMLDivElement>(null);
  const rangeOptions = ["Weekly", "Monthly"];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        rangeDropdownRef.current &&
        !rangeDropdownRef.current.contains(event.target as Node)
      ) {
        setIsRangeOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRangeChange = (range: string) => {
    setSelectedRange(range);
    setIsRangeOpen(false);
  };

  // Helper function to format the date for the X-axis
  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };

  // 1. Group data by day and calculate totals and counts
  const dailyDataAggregator = (data || [])
    .filter((item) => item.mood_score !== null)
    .reduce((acc, item) => {
      const dateKey = new Date(item.created_at).toISOString().split("T")[0];
      if (!acc[dateKey]) {
        acc[dateKey] = {
          mood_score_total: 0,
          sentiment_score_total: 0,
          count: 0,
          created_at: dateKey,
        };
      }
      acc[dateKey].mood_score_total += item.mood_score!;
      acc[dateKey].sentiment_score_total += item.sentiment_score;
      acc[dateKey].count += 1;
      return acc;
    }, {} as Record<string, { mood_score_total: number; sentiment_score_total: number; count: number; created_at: string }>);

  // 2. Calculate the average for each day and format the data for the chart
  const processedData = Object.values(dailyDataAggregator)
    .map((day) => ({
      mood_score: day.mood_score_total / day.count,
      sentiment_score: day.sentiment_score_total / day.count,
      created_at: day.created_at,
      created_at_formatted: formatXAxis(day.created_at),
    }))
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

  // 3. Filter data based on selected range
  const chartData = useMemo(() => {
    if (selectedRange === "Weekly" && processedData.length > 0) {
      const lastDate = new Date(
        processedData[processedData.length - 1].created_at
      );
      const sevenDaysAgo = new Date(lastDate);
      sevenDaysAgo.setUTCDate(lastDate.getUTCDate() - 6); // Inclusive 7-day period

      return processedData.filter((d) => {
        const currentDate = new Date(d.created_at);
        return currentDate >= sevenDaysAgo && currentDate <= lastDate;
      });
    }
    return processedData; // Default to 'Monthly' which shows all data
  }, [processedData, selectedRange]);

  // 4. Create the date range string for display
  const dateRangeDisplay = useMemo(() => {
    if (chartData.length === 0) return null;

    const formatDate = (dateString: string) =>
      new Date(dateString).toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });

    const fromDate = formatDate(chartData[0].created_at);
    const toDate = formatDate(chartData[chartData.length - 1].created_at);

    return `${fromDate} - ${toDate}`;
  }, [chartData]);

  // If there is no data to display, show a message.
  if (processedData.length === 0) {
    return (
      <div className="w-3/4 h-[500px] bg-gray-900 text-white p-4 rounded-lg flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4 text-center">
          Mood & Sentiment Over Time
        </h2>
        <p className="text-gray-400">No data available to display.</p>
      </div>
    );
  }

  return (
    <div className="w-3/4 border-border-light dark:border-border-dark border h-[500px] bg-secondary-light dark:bg-secondary-dark rounded-xl mt-6 p-4 flex flex-col">
      <div className="flex justify-between items-center w-full px-4 pt-2 pb-6">
        <h1 className="text-xl text-text-light dark:text-text-dark font-bold">
          Score Chart
        </h1>

        {/* Controls container for date range and dropdown */}
        <div className="flex items-center gap-4">
          {/* NEW: Date Range Display */}
          {dateRangeDisplay && (
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub whitespace-nowrap">
              {dateRangeDisplay}
            </p>
          )}

          {/* Custom Dropdown */}
          <div className="relative" ref={rangeDropdownRef}>
            <button
              onClick={() => setIsRangeOpen(!isRangeOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg text-sm text-text-light-sub dark:text-text-dark-sub focus:outline-none transition-colors"
            >
              <span>{selectedRange}</span>
              <motion.div animate={{ rotate: isRangeOpen ? 180 : 0 }}>
                <ChevronDown size={16} />
              </motion.div>
            </button>

            <AnimatePresence>
              {isRangeOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute top-full right-0 mt-2 w-36 bg-secondary-light dark:bg-secondary-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark origin-top-right z-10 p-2"
                >
                  {rangeOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => handleRangeChange(option)}
                      className="flex items-center w-full px-3 py-2 text-sm text-left rounded-md text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
                    >
                      {option}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData} // Use the filtered data
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
        >
          <XAxis dataKey="created_at_formatted" hide />
          <YAxis yAxisId="left" domain={[1, 5]} hide />
          <YAxis yAxisId="right" domain={[-1, 1]} hide />
          <Tooltip cursor={false} content={<CustomTooltip />} />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="mood_score"
            stroke="#8b8dda"
            strokeWidth={2}
            activeDot={{ r: 4, strokeWidth: 0 }}
            name="Mood Score"
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="sentiment_score"
            stroke="#65cc65"
            strokeWidth={2}
            activeDot={{ r: 4, strokeWidth: 0 }}
            name="Sentiment Score"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export default MoodSentimentChart;
