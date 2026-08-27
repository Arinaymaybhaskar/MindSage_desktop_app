import React, { useEffect, useState, useMemo } from "react";
import {
  RefreshCw,
  Database,
  Eye,
  EyeOff,
  Search,
  Filter,
  AlertCircle,
  Loader2,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion"; // Assuming a reusable Dropdown component
import { Dropdown } from "../components/ui/Dropdown";

// --- TYPE DEFINITIONS (remain the same) ---
interface Collection {
  name: string;
  [key: string]: unknown;
}
interface Point {
  id: string | number;
  payload: { [key: string]: unknown };
  vectors?: { [key: string]: number[] };
}
interface CollectionDetails {
  name?: string;
  points_count?: number;
  status?: string;
  [key: string]: unknown;
}

// --- REVAMPED: Reusable Themed PointCard Component ---
const PointCard: React.FC<{ point: Point; showVectors: boolean }> = ({
  point,
  showVectors,
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl transition-shadow hover:shadow-md"
    >
      <div className="p-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="bg-tertiary-light dark:bg-tertiary-dark text-dark1 dark:text-light1 px-2.5 py-1 rounded text-sm font-mono font-medium">
            ID: {point.id}
          </span>
          {point.payload?.user_id != null && (
            <span className="text-sm text-text-light-sub dark:text-text-dark-sub">
              User: {String(point.payload.user_id)}
            </span>
          )}
        </div>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="font-medium text-text-light dark:text-text-dark mb-2">
            Payload
          </h4>
          <div className="space-y-3 text-xs overflow-hidden">
            {Object.entries(point.payload || {}).map(([key, value]) => (
              <div key={key} className="grid grid-cols-3 gap-2">
                <span className="font-medium text-text-light-sub dark:text-text-dark-sub truncate capitalize">
                  {key.replace(/_/g, " ")}
                </span>
                <span className="col-span-2 text-text-light dark:text-text-dark bg-tertiary-light dark:bg-tertiary-dark rounded px-2 py-1 font-mono break-all">
                  {JSON.stringify(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
        {showVectors && point.vectors && (
          <div className="md:border-l md:pl-4 border-border-light dark:border-border-dark">
            <h4 className="font-medium text-text-light dark:text-text-dark mb-2">
              Vector (first 8 dims)
            </h4>
            <div className="bg-tertiary-light dark:bg-tertiary-dark rounded p-3">
              <code className="text-xs text-text-light-sub dark:text-text-dark-sub break-all">
                [
                {Object.values(point.vectors)[0]
                  ?.slice(0, 8)
                  .map((v) => v.toFixed(4))
                  .join(", ")}
                ...]
              </code>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default function QdrantViewer() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [, setDetails] = useState<CollectionDetails | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVectors, setShowVectors] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const user = localStorage.getItem("userInfo");
  let userId: number;
  if (user) {
    userId = JSON.parse(user).id;
  }
  // --- NEW: State for sorting ---
  const [sortKey, setSortKey] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sortOptions = [
    { value: "created_at", label: "Created Date" },
    { value: "mood_score", label: "Mood Score" },
    { value: "id", label: "Point ID" },
  ];

  const sortedAndFilteredPoints = useMemo(() => {
    let processedPoints = [...points];

    // Filtering
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      processedPoints = processedPoints.filter((point) =>
        JSON.stringify(point).toLowerCase().includes(searchLower)
      );
    }

    // Sorting
    processedPoints.sort((a, b) => {
      // Payload values are untyped, so compare them as strings/numbers only
      // when both sides are actually present.
      const valA = a.payload?.[sortKey] as string | number | undefined;
      const valB = b.payload?.[sortKey] as string | number | undefined;

      if (valA == null || valB == null) return 0;

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return processedPoints;
  }, [points, searchTerm, sortKey, sortOrder]);

  // All data fetching logic remains the same...
  const loadCollections = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://127.0.0.1:6333/collections");
      const data = await res.json();
      setCollections(data.result?.collections || []);
    } catch (err) {
      console.error("Error fetching collections:", err);
      setError(
        "Failed to connect to Qdrant. Make sure it's running on port 6333."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async (name: string) => {
    setSelected(name);
    setDetails(null);
    setPoints([]);
    setLoading(true);
    setError(null);
    try {
      // Fetch collection info
      const res = await fetch(`http://127.0.0.1:6333/collections/${name}`);
      const data = await res.json();
      setDetails(data.result); // Fetch points using the correct scroll API

      const pointsRes = await fetch(
        `http://127.0.0.1:6333/collections/${name}/points/scroll`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            limit: 50,
            with_payload: true,
            with_vectors: showVectors,
          }),
        }
      );
      const pointsData = await pointsRes.json();
      const userPoints = pointsData.result.points.filter(
        (point: Point) => point.payload.user_id === userId
      );
      setPoints(userPoints || []);
    } catch (err) {
      console.error("Error fetching collection details:", err);
      setError("Failed to fetch collection details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollections();
  }, []);

  return (
    <div className="bg-base-light dark:bg-base-dark h-full overflow-y-auto p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header, Error, and Collections sections remain the same... */}
        {/* Header */}{" "}
        <div className="bg-surface-light dark:bg-surface-dark rounded-lg shadow-sm border border-border-light dark:border-border-dark p-6">
          {" "}
          <div className="flex items-center justify-between">
            {" "}
            <div className="flex items-center space-x-4">
              <Database className="h-10 w-10 text-dark1 dark:text-light1" />{" "}
              <div>
                {" "}
                <h1 className="text-3xl font-bold text-text-light dark:text-text-dark">
                  Qdrant Viewer
                </h1>{" "}
                <p className="text-text-light-sub dark:text-text-dark-sub">
                  Manage your vector database collections.
                </p>{" "}
              </div>{" "}
            </div>{" "}
            <button
              onClick={loadCollections}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-light1 dark:bg-dark1 text-white rounded-lg hover:bg-light1 dark:bg-dark1/90 disabled:opacity-60 transition-colors"
            >
              {" "}
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              <span>Refresh</span>{" "}
            </button>{" "}
          </div>{" "}
        </div>
        {/* Error State */}{" "}
        {error && (
          <div className="bg-danger/10 border border-danger/20 rounded-lg p-4 flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 text-danger" />
            <p className="text-danger font-medium">{error}</p>{" "}
          </div>
        )}
        {/* Collections */}{" "}
        <div className="bg-surface-light dark:bg-surface-dark rounded-lg shadow-sm border border-border-light dark:border-border-dark">
          {" "}
          <div className="p-6 border-b border-border-light dark:border-border-dark">
            {" "}
            <h2 className="text-xl font-semibold text-text-light dark:text-text-dark">
              Collections
            </h2>{" "}
            <p className="text-text-light-sub dark:text-text-dark-sub">
              Select a collection to view its contents.
            </p>{" "}
          </div>{" "}
          {loading ? (
            <div className="p-6 text-center">
              {" "}
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-info mx-auto"></div>{" "}
              <p className="mt-2 text-text-light-sub dark:text-text-dark-sub">
                Loading collections...
              </p>{" "}
            </div>
          ) : collections.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              {" "}
              <Database className="h-12 w-12 mx-auto mb-4 text-tertiary-light dark:text-tertiary-dark" />
              <p>No collections found</p>{" "}
            </div>
          ) : (
            <div className="p-6">
              {" "}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {" "}
                {collections.map((col: Collection) => (
                  <button
                    key={col.name}
                    onClick={() => loadDetails(col.name)}
                    className={`p-4 rounded-lg border-2 text-left transition-all hover:shadow-md ${
                      selected === col.name
                        ? "border-info bg-light1 dark:bg-dark1/5"
                        : "border-border-light dark:border-border-dark hover:border-border-light/70 dark:hover:border-border-dark/70"
                    }`}
                  >
                    {" "}
                    <div className="flex items-center space-x-3">
                      {" "}
                      <Database className="h-6 w-6 text-dark1 dark:text-light1" />{" "}
                      <div>
                        {" "}
                        <h3 className="font-semibold text-text-light dark:text-text-dark">
                          {col.name}
                        </h3>{" "}
                        <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
                          Click to view details
                        </p>{" "}
                      </div>{" "}
                    </div>{" "}
                  </button>
                ))}{" "}
              </div>{" "}
            </div>
          )}{" "}
        </div>
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Collection Details section remains mostly the same */}

              {/* --- REVAMPED: Points Section --- */}
              <div className="bg-surface-light dark:bg-surface-dark rounded-lg shadow-sm border border-border-light dark:border-border-dark">
                <div className="p-6 border-b border-border-light dark:border-border-dark">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-text-light dark:text-text-dark">
                        Points in {selected}
                      </h2>
                      <p className="text-text-light-sub dark:text-text-dark-sub">
                        Showing {sortedAndFilteredPoints.length} of{" "}
                        {points.length} points
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-light-sub dark:text-text-dark-sub" />
                        <input
                          type="text"
                          placeholder="Search points..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full sm:w-64 pl-10 pr-4 py-2 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg focus:ring-2 focus:ring-info focus:border-transparent outline-none"
                        />
                      </div>
                      <button
                        onClick={() => setShowVectors(!showVectors)}
                        className="flex items-center space-x-2 px-3 py-2 border border-border-light dark:border-border-dark rounded-lg hover:bg-tertiary-light dark:hover:bg-tertiary-dark text-text-light dark:text-text-dark"
                      >
                        {showVectors ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        <span className="hidden md:inline">
                          {showVectors ? "Hide" : "Show"} Vectors
                        </span>
                      </button>
                    </div>
                  </div>
                  {/* --- NEW: Sorting Controls --- */}
                  <div className="mt-4 flex items-center gap-4">
                    <div className="w-48">
                      <Dropdown
                        options={sortOptions}
                        selectedValue={sortKey}
                        onSelect={setSortKey}
                        placeholder="Sort by..."
                      />
                    </div>
                    <button
                      onClick={() =>
                        setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                      }
                      className="p-2 border border-border-light dark:border-border-dark rounded-lg hover:bg-tertiary-light dark:hover:bg-tertiary-dark text-text-light dark:text-text-dark "
                    >
                      {sortOrder === "asc" ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  {loading ? (
                    <div className="text-center py-8">
                      <Loader2 className="h-8 w-8 mx-auto animate-spin text-dark1 dark:text-light1" />
                    </div>
                  ) : sortedAndFilteredPoints.length === 0 ? (
                    <div className="text-center py-8 text-text-light-sub dark:text-text-dark-sub">
                      <Filter className="h-12 w-12 mx-auto mb-4 text-tertiary-light dark:text-tertiary-dark" />
                      <p>No points match your criteria.</p>
                    </div>
                  ) : (
                    <motion.div layout className="space-y-4">
                      <AnimatePresence>
                        {sortedAndFilteredPoints.map((point) => (
                          <PointCard
                            key={point.id}
                            point={point}
                            showVectors={showVectors}
                          />
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
