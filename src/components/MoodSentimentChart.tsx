import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Define the interface for a single data point for type safety
interface DataPoint {
  mood_score: number | null;
  created_at: string;
  sentiment_score: number;
}

/**
 * A chart component to display mood and sentiment scores over time.
 * It's robustly designed to handle null, undefined, or empty data.
 * It also averages the scores for days with multiple entries.
 * @param {object} props - The component props.
 * @param {DataPoint[] | null | undefined} props.data - The array of data to display.
 */
function MoodSentimentChart({
  data,
}: {
  data: DataPoint[] | null | undefined;
}) {
  // Helper function to format the date for the X-axis
  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    // Adding timeZone to ensure date is parsed correctly across browsers
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };

  // 1. Group data by day and calculate totals and counts
  const dailyDataAggregator = (data || [])
    .filter((item) => item.mood_score !== null) // Filter out items where mood_score is null
    .reduce((acc, item) => {
      const dateKey = new Date(item.created_at).toISOString().split("T")[0]; // 'YYYY-MM-DD'

      if (!acc[dateKey]) {
        acc[dateKey] = {
          mood_score_total: 0,
          sentiment_score_total: 0,
          count: 0,
          created_at: dateKey,
        };
      }

      // Add current item's scores to the daily total
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
    // 3. Sort the data chronologically to ensure the line chart connects points correctly
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

  // If there is no data to display (either initially or after filtering), show a message.
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
    <div className="w-3/4 h-[500px] pt-20 bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl mt-6 p-4 flex flex-col items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={processedData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <Legend wrapperStyle={{ color: "#D1D5DB", paddingTop: "20px" }} />
          <XAxis
            dataKey="created_at_formatted"
            stroke="#9CA3AF"
            tick={{ fill: "#D1D5DB" }}
            axisLine={{ stroke: "#4B5563" }}
            tickLine={{ stroke: "#4B5563" }}
          />
          <YAxis
            yAxisId="left"
            dataKey="mood_score"
            stroke="#8884d8"
            domain={[1, 5]}
            tick={{ fill: "#D1D5DB" }}
            axisLine={{ stroke: "#8884d8" }}
            tickLine={{ stroke: "#8884d8" }}
            label={{
              value: "Mood Score",
              angle: -90,
              position: "insideLeft",
              fill: "#D1D5DB",
            }}
          />
          <YAxis
            yAxisId="right"
            dataKey="sentiment_score"
            orientation="right"
            stroke="#82ca9d"
            domain={[-1, 1]}
            tick={{ fill: "#D1D5DB" }}
            axisLine={{ stroke: "#82ca9d" }}
            tickLine={{ stroke: "#82ca9d" }}
            label={{
              value: "Sentiment Score",
              angle: 90,
              position: "insideRight",
              fill: "#D1D5DB",
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1F2937",
              border: "1px solid #4B5563",
              borderRadius: "0.5rem",
            }}
            labelStyle={{ color: "#F9FAFB" }}
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="mood_score"
            stroke="#8884d8"
            strokeWidth={2}
            activeDot={{ r: 8 }}
            name="Mood Score"
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="sentiment_score"
            stroke="#82ca9d"
            strokeWidth={2}
            activeDot={{ r: 8 }}
            name="Sentiment Score"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export default MoodSentimentChart;
