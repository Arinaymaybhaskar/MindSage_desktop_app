import { useState, useRef, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Loader } from "lucide-react"; // Using a loader icon for a better look
import { dashboardService } from "../api/dashBoardService";
import { useAuth } from "../hooks/useAuth";
import type { DayScore } from "../utils/dashboardInsights";

// The dashboard channels report `avgMood: null` for days with no entry, so
// this mirrors DayScore rather than narrowing it to a number.
type ScoreDataPoint = DayScore;

interface TooltipEntry {
  name?: string;
  value?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-3 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg shadow-lg">
        <p className="text-lg font-bold text-gray-50 mb-2">{label}</p>
        <div className="text-sm">
          <p className="text-text-light dark:text-text-dark">
            {`${payload[0].name} : ${(payload[0].value ?? 0).toFixed(2)}`}
          </p>
        </div>
      </div>
    );
  }
  return null;
};

function MoodSentimentChart({
  initialData,
}: {
  initialData: ScoreDataPoint[] | null | undefined;
}) {
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState("Last Week");
  const [chartData, setChartData] = useState<
    ScoreDataPoint[] | null | undefined
  >(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const rangeDropdownRef = useRef<HTMLDivElement>(null);
  const rangeOptions = ["Last Week", "Last Month", "All Time"];
  const { accessToken } = useAuth();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

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

  useEffect(() => {
    const fetchData = async () => {
      // Don't show loader for initial data load
      if (selectedRange !== "Last Week") {
        setIsLoading(true);
      }
      try {
        switch (selectedRange) {
          case "Last Week": {
            setChartData(initialData);
            break;
          }
          case "Last Month": {
            const monthlyData = await dashboardService.getMonthlyScore(
              authMode,
              accessToken!
            );
            setChartData(monthlyData);
            break;
          }
          case "All Time": {
            const allTimeData = await dashboardService.getAllTimeScore(
              authMode,
              accessToken!
            );
            setChartData(allTimeData);
            break;
          }
          default: {
            setChartData(initialData);
          }
        }
      } catch (error) {
        console.error("Failed to fetch chart data:", error);
        setChartData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedRange, initialData, authMode, accessToken]);

  const formatLabelDate = (tickItem: string) => {
    const date = new Date(tickItem);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };

  const formattedChartData = useMemo(() => {
    if (!chartData) return [];
    return chartData
      .map((item) => ({
        mood_score: item.avgMood,
        created_at: item.day,
        created_at_formatted: formatLabelDate(item.day),
      }))
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [chartData]);

  const dateRangeDisplay = useMemo(() => {
    if (!formattedChartData || formattedChartData.length === 0) return null;
    const fromDate = formatLabelDate(formattedChartData[0].created_at);
    const toDate = formatLabelDate(
      formattedChartData[formattedChartData.length - 1].created_at
    );
    return `${fromDate} - ${toDate}`;
  }, [formattedChartData]);

  const handleRangeChange = (range: string) => {
    setSelectedRange(range);
    setIsRangeOpen(false);
  };

  function getTailwindColor(className: string) {
    const tempEl = document.createElement("div");
    tempEl.className = className;
    tempEl.style.display = "none";
    document.body.appendChild(tempEl);
    const color = getComputedStyle(tempEl).backgroundColor;
    document.body.removeChild(tempEl);
    return color;
  }

  const infoColor = getTailwindColor("bg-light1 dark:bg-dark1");

  // Animation variants for smooth transitions
  const motionVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.3, ease: "easeInOut" },
  };

  return (
    <div className=" border-border-light dark:border-border-dark border h-[500px] bg-secondary-light dark:bg-secondary-dark rounded-xl flex flex-col overflow-hidden">
      {/* Chart Header */}
      <div className="flex justify-between items-center w-full px-8 pt-6 pb-6 z-10">
        <h1 className="font-display text-xl text-text-light dark:text-text-dark font-bold">
          Score Chart
        </h1>
        <div className="flex items-center gap-4">
          {dateRangeDisplay && (
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub whitespace-nowrap">
              {dateRangeDisplay}
            </p>
          )}
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

      {/* Chart Content with Animated Transitions */}
      <div className="flex-1 relative -mt-10">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loader"
              variants={motionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full h-full flex flex-col items-center justify-center text-gray-400"
            >
              <Loader className="animate-spin h-8 w-8 mb-2" />
              <p>Loading Data...</p>
            </motion.div>
          ) : !formattedChartData || formattedChartData.length === 0 ? (
            <motion.div
              key="no-data"
              variants={motionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full h-full flex flex-col items-center justify-center"
            >
              <h2 className="font-display text-xl font-bold mb-2 text-center text-text-light dark:text-text-dark">
                No Data Available
              </h2>
              <p className="text-gray-400">
                There are no mood scores to display for this period.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="chart"
              variants={motionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full h-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={formattedChartData}
                  margin={{ top: 0, right: 0, left: 0, bottom: 10 }}
                >
                  <defs>
                    <linearGradient id="colorMood" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={infoColor}
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="95%"
                        stopColor={infoColor}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="created_at_formatted" hide />
                  <YAxis domain={[1, 5]} hide />
                  <Tooltip cursor={false} content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="mood_score"
                    stroke={infoColor}
                    strokeWidth={2}
                    activeDot={{ r: 1, strokeWidth: 1 }}
                    name="Mood Score"
                    dot={false}
                    fill="url(#colorMood)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default MoodSentimentChart;
