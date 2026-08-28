import { toast } from "react-hot-toast";
import { Loader2, Download, CheckCircle, Info, X, Trash2 } from "lucide-react";
import { ollamaService } from "../../api/ollamaService";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Dropdown } from "../ui/Dropdown";
import type { OllamaModel, OllamaModelInfo } from "../../types/Ollama";
import type { SettingsPanelProps } from "../../types/User";

// ✨ STEP 1: Define a structured type for our parsed model data
export type ParsedModel = {
  name: string;
  modified: string;
  size: string;
  details: {
    family: string;
    parameterSize: string;
    quantization: string;
    format: string;
  };
  capabilities: string[];
  rawInfo: OllamaModelInfo; // Keep the raw data for the modal
};

// ✨ STEP 2: Helper function to parse the complex JSON
const parseModelData = (model: OllamaModel): ParsedModel => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid Date";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const info: OllamaModelInfo = model.info || {};
  const details = info.details || {};

  return {
    name: model.name,
    size: model.modified,
    modified: formatDate(info.modified_at ?? ""),
    details: {
      family: details.family || "unknown",
      parameterSize: details.parameter_size || "N/A",
      quantization: details.quantization_level || "N/A",
      format: details.format || "gguf",
    },
    capabilities: info.capabilities || [],
    rawInfo: info,
  };
};

// ✨ STEP 3: Tasks
const TASKS = [
  {
    key: "chat",
    label: "Text Generation (Chat)",
    requiredCapability: "completion",
  },
  {
    key: "vision",
    label: "Image Reading (Vision)",
    requiredCapability: "vision",
  },
  {
    key: "decision",
    label: "Decision Making (Chat Flow)",
    requiredCapability: "completion",
  },
];

// ✨ STEP 4: System Tiers
const SYSTEM_TIERS = [
  {
    key: "high",
    label: "High-End System",
    specs: "Greater than 16 GB VRAM / High CPU+GPU",
    description: "Can run large parameter models and multimodal models.",
  },
  {
    key: "mid",
    label: "Mid-Range System",
    specs: "8–16 GB VRAM / Mid CPU/GPU",
    description:
      "Can run medium-sized models, mostly text-focused or smaller multimodal.",
  },
  {
    key: "low",
    label: "Low-End System",
    specs: "Less than 8 GB VRAM / CPU only or small GPU",
    description:
      "Use lightweight models for basic text or minimal vision tasks.",
  },
];

// ✨ STEP 5: Recommended Models with Tier
const recommendedModels = [
  // High-End Tier
  {
    name: "Llama 3",
    description: "Optimized for conversational AI and decision-making tasks.",
    capability: "completion",
    model: "llama3:8b",
    parameters: "8b",
    tier: "high",
    size: "4.7GB",
  },
  {
    name: "Nous Hermes 2",
    description: "Excels in scientific discussions and complex reasoning.",
    capability: "completion",
    model: "nous-hermes:13b",
    parameters: "13b",
    tier: "high",
    size: "7.4GB",
  },
  {
    name: "Command-R 7B",
    description: "High-quality instruction-following.",
    capability: "completion",
    model: "command-r7b:7b",
    parameters: "7b",
    tier: "high",
    size: "5.1GB",
  },
  {
    name: "Llama 3.2 Vision",
    description: "Visual understanding + text generation.",
    capability: "vision",
    tier: "high",
    model: "llama3.2-vision:11b",
    parameters: "11b",
    size: "7.8GB",
  },
  {
    name: "LLaVA",
    description: "Vision + language model.",
    capability: "vision",
    tier: "high",
    model: "llava:13b",
    parameters: "13b",
    size: "8.0GB",
  },
  {
    name: "Qwen 2.5",
    description: "Excels in visual inputs.",
    capability: "vision",
    tier: "high",
    model: "qwen2.5:14b",
    parameters: "14b",
    size: "9.0GB",
  },

  // Mid-Range Tier
  {
    name: "Mistral 7B",
    description: "Efficient for decision-making.",
    capability: "completion",
    tier: "mid",
    model: "mistral:7b",
    parameters: "7b",
    size: "4.4GB",
  },
  {
    name: "Gemma 3",
    description: "Advanced reasoning/text/vision tasks.",
    capability: "completion",
    tier: "mid",
    model: "gemma3:4b",
    parameters: "4b",
    size: "3.3GB",
  },
  {
    name: "Minicpm-V",
    description: "Multimodal vision-language.",
    capability: "vision",
    tier: "mid",
    model: "minicpm-v:8b",
    parameters: "8b",
    size: "5.5GB",
  },

  // Low-End Tier
  {
    name: "Gemma 3",
    description: "Lightweight reasoning/text/vision tasks.",
    capability: "completion",
    tier: "low",
    model: "gemma3:4b",
    parameters: "4b",
    size: "3.3GB",
  },
  {
    name: "llama3.2:1b",
    description: "Lightweight text generation.",
    capability: "completion",
    tier: "low",
    model: "llama3.2:1b",
    parameters: "1b",
    size: "1.3GB",
  },
  {
    name: "Moondream",
    description: "Light multimodal vision-language.",
    capability: "vision",
    tier: "low",
    model: "moondream:1.8b",
    parameters: "1.8b",
    size: "1.7GB",
  },
];

const FRIENDLY_LABELS: Record<string, string> = {
  chat: "Understands and summarizes your journals, chats with you, fills in missing details, and suggests goals.",
  decision:
    "Helps with quick choices behind the scenes, like smart word suggestions and guiding the chat smoothly.",
  vision: "Looks at images you share and explains what's in them.",
};

type ModelSettingsProps = Pick<
  SettingsPanelProps,
  "settings" | "onSettingsSave"
>;

export default function ModelSettings({ settings }: ModelSettingsProps) {
  const [installedModels, setInstalledModels] = useState<ParsedModel[]>([]);

  // Initialize state from localStorage, falling back to props or an empty object.
  const [selectedModels, setSelectedModels] = useState(() => {
    try {
      const savedModels = localStorage.getItem("selectedOllamaModels");
      if (savedModels) {
        return JSON.parse(savedModels);
      }
    } catch (error) {
      console.error("Failed to parse selected models from localStorage", error);
    }
    return settings?.models || {};
  });

  const [loadingModel, setLoadingModel] = useState<string | null>(null);
  const [detailedModel, setDetailedModel] = useState<ParsedModel | null>(null);
  const [capabilityFilter, setCapabilityFilter] = useState<string>("all");
  const [selectedTier, setSelectedTier] = useState<string>("high");
  const { accessToken } = useAuth();
  const [modelToDelete, setModelToDelete] = useState<ParsedModel | null>(null);

  // MODIFIED: Added a new state to handle the initial loading of the component.
  const [isInitializing, setIsInitializing] = useState(true);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const handleDelete = async (modelName: string) => {
    const toastId = toast.loading(`Deleting ${modelName}...`);
    try {
      await ollamaService.deleteModel(accessToken!, modelName);
      const rawModels = await ollamaService.getModels(accessToken!);
      setInstalledModels(rawModels.map(parseModelData));
      toast.success(`${modelName} deleted!`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(`Failed to delete ${modelName}`, { id: toastId });
    } finally {
      setModelToDelete(null);
    }
  };

  // MODIFIED: This effect now controls the new `isInitializing` state.
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const rawModels = await ollamaService.getModels(accessToken!);
        setInstalledModels(rawModels.map(parseModelData));
      } catch (err) {
        console.error(err);
        toast.error("Failed to fetch models");
      } finally {
        setIsInitializing(false); // Set loading to false after fetch completes
      }
    };
    fetchModels();
  }, [accessToken]);

  // Modified: Initialize from electron-store
  useEffect(() => {
    const loadSelectedModels = async () => {
      try {
        const saved = await window.electron.ipcRenderer.invoke(
          "models:get-selected",
        );
        if (saved) {
          setSelectedModels(saved);
        }
      } catch (error) {
        console.error("Failed to load model settings", error);
        toast.error("Failed to load saved model settings");
      }
    };
    loadSelectedModels();
  }, []);

  // Modified: Save to electron-store
  const handleChange = async (task: string, model: string) => {
    const updated = { ...selectedModels, [task]: model };
    setSelectedModels(updated);

    try {
      await window.electron.ipcRenderer.invoke("models:save-selected", updated);
      toast.success("Model selection saved!");
    } catch (error) {
      console.error("Failed to save model selections", error);
      toast.error("Could not save model selection");
    }
  };

  const handleDownload = async (modelName: string) => {
    setLoadingModel(modelName);
    const toastId = toast.loading(`Downloading ${modelName}...`);
    try {
      await ollamaService.downloadModel(accessToken!, modelName);
      const rawModels = await ollamaService.getModels(accessToken!);
      setInstalledModels(rawModels.map(parseModelData));
      toast.success(`${modelName} downloaded!`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(`Download failed for ${modelName}`, { id: toastId });
    } finally {
      setLoadingModel(null);
    }
  };

  const getModelsForTask = useCallback(
    (capability: string) =>
      installedModels
        .filter((model) => model.capabilities.includes(capability))
        .map((model) => ({ value: model.name, label: model.name })),
    [installedModels],
  );

  const filteredModels = useMemo(() => {
    if (capabilityFilter === "all") return installedModels;
    return installedModels.filter((model) =>
      model.capabilities.includes(capabilityFilter),
    );
  }, [installedModels, capabilityFilter]);

  const capabilitiesOptions = useMemo(() => {
    const allCaps = installedModels.flatMap((m) => m.capabilities);
    const uniqueCaps = Array.from(new Set(allCaps));
    return [
      { value: "all", label: "All" },
      ...uniqueCaps.map((c) => ({ value: c, label: c })),
    ];
  }, [installedModels]);

  const filteredRecommendedModels = useMemo(() => {
    return recommendedModels.filter((m) => m.tier === selectedTier);
  }, [selectedTier]);

  // MODIFIED: Show a full-component loader during initialization.
  if (isInitializing) {
    return (
      <div className="flex justify-center items-center h-96 bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
        <Loader2
          className="animate-spin text-dark1 dark:text-light1"
          size={32}
        />
        <span className="ml-4 text-lg text-text-light-sub dark:text-text-dark-sub">
          Loading Model Settings...
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="font-display text-xl font-bold text-text-light dark:text-text-dark">
            AI Model Settings
          </h2>
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
            Assign local Ollama models to specific app features.
          </p>
        </div>

        <div className="p-6 space-y-8">
          {/* Section 1: Assign Models */}
          <section id="assign-models">
            <h3 className="font-display text-lg font-semibold mb-4 text-text-light dark:text-text-dark">
              Assign Models to Tasks
            </h3>
            <div className="space-y-4">
              {TASKS.map(({ key, label, requiredCapability }) => (
                <div
                  key={key}
                  className="rounded-lg bg-tertiary-light dark:bg-tertiary-dark overflow-hidden"
                >
                  {/* Task Header */}
                  <div
                    className="p-4 cursor-pointer hover:bg-quaternary-light dark:hover:bg-quaternary-dark transition-colors"
                    onClick={() =>
                      setExpandedTask(expandedTask === key ? null : key)
                    }
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-light dark:text-text-dark">
                          {label}
                        </span>
                        <button className="text-text-light-sub dark:text-text-dark-sub">
                          <Info size={16} />
                        </button>
                      </div>
                      <div className="w-full sm:w-64">
                        <Dropdown
                          options={getModelsForTask(requiredCapability)}
                          selectedValue={selectedModels[key] || ""}
                          onSelect={(value) => handleChange(key, value)}
                          placeholder="-- Select a compatible model --"
                          onClick={(e) => e.stopPropagation()} // Prevent collapse when clicking dropdown
                        />
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Description */}
                  {expandedTask === key && (
                    <div className="px-4 pb-4 text-sm text-text-light-sub dark:text-text-dark-sub border-t border-border-light dark:border-border-dark">
                      <p className="mt-2">{FRIENDLY_LABELS[key]}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs bg-light1 dark:bg-dark1/10 text-dark1 dark:text-light1 py-1 rounded-full">
                          Required capability: {requiredCapability}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Section 2: Recommended Models */}
          <section id="recommended-models" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
              <h3 className="font-display text-lg font-semibold mb-4 text-text-light dark:text-text-dark">
                Recommended Models
              </h3>
              <div className="mb-4 flex flex-col items-start sm:items-end">
                <div className="w-full sm:w-72">
                  <Dropdown
                    options={SYSTEM_TIERS.map((t) => ({
                      value: t.key,
                      label: t.label,
                    }))}
                    selectedValue={selectedTier}
                    onSelect={(value) => setSelectedTier(value)}
                    placeholder="Select your system tier"
                  />
                </div>
                <p className="text-xs text-text-light-sub dark:text-text-dark-sub mt-1 text-left sm:text-right">
                  {
                    SYSTEM_TIERS.find((t) => t.key === selectedTier)
                      ?.description
                  }
                </p>
                <p className="text-xs text-text-light-sub dark:text-text-dark-sub mt-1 text-left sm:text-right">
                  {SYSTEM_TIERS.find((t) => t.key === selectedTier)?.specs}
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {filteredRecommendedModels.map((m) => {
                const isInstalled = installedModels.some((im) =>
                  im.name.includes(m.model),
                );
                return (
                  <div
                    key={m.model}
                    className="p-4 bg-tertiary-light dark:bg-tertiary-dark rounded-lg flex flex-col border border-border-light dark:border-border-dark"
                  >
                    <div className="flex justify-between items-start">
                      <h4 className="font-medium text-text-light dark:text-text-dark">
                        {m.name}
                      </h4>
                      {isInstalled ? (
                        <span className="flex items-center gap-2 text-green-500 font-medium text-sm">
                          <CheckCircle size={16} /> Installed
                        </span>
                      ) : (
                        <button
                          onClick={() => handleDownload(m.model)}
                          disabled={loadingModel !== null}
                          className="p-2 text-white rounded-lg hover:text-dark1 dark:text-light1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {loadingModel === m.model ? (
                            <Loader2 className="animate-spin" size={18} />
                          ) : (
                            <Download size={18} />
                          )}
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
                      {m.description}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3 text-xs">
                      <Badge>{m.capability}</Badge>
                      <Badge>{m.parameters}</Badge>
                      <Badge>{m.size}</Badge>
                    </div>
                    <p className="text-xs text-text-light-sub dark:text-text-dark-sub mt-2 break-all">
                      Model ID: {m.model}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 3: Installed Models */}
          <section id="installed-models" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-display text-lg font-semibold text-text-light dark:text-text-dark">
                Installed Models
              </h3>
              <div className="w-48">
                <Dropdown
                  options={capabilitiesOptions}
                  selectedValue={capabilityFilter}
                  onSelect={(value) => setCapabilityFilter(value)}
                  placeholder="Filter by capability"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {filteredModels.map((model) => (
                <ModelCard
                  key={model.name}
                  model={model}
                  onViewDetails={() => setDetailedModel(model)}
                  onDelete={() => setModelToDelete(model)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      {modelToDelete && (
        <DeleteConfirmModal
          model={modelToDelete}
          onCancel={() => setModelToDelete(null)}
          onConfirm={() => handleDelete(modelToDelete.name)}
        />
      )}

      {detailedModel && (
        <ModelDetailsModal
          model={detailedModel}
          onClose={() => setDetailedModel(null)}
        />
      )}
    </>
  );
}

// Badge Component
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-light1 dark:bg-dark1/10 text-dark1 dark:text-light1 text-xs font-medium px-2.5 py-1 rounded-full">
      {children}
    </span>
  );
}

function ModelCard({
  model,
  onViewDetails,
  onDelete,
}: {
  model: ParsedModel;
  onViewDetails: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="p-4 bg-tertiary-light dark:bg-tertiary-dark rounded-lg border border-border-light dark:border-border-dark flex flex-col justify-between h-full">
      <div>
        <div className="flex justify-between items-start">
          <h4 className="font-medium text-text-light dark:text-text-dark break-all">
            {model.name}
          </h4>
          <button
            onClick={onDelete}
            className="hover:text-danger cursor-pointer text-text-light dark:text-text-dark text-sm font-medium"
          >
            <Trash2 size={16} />
          </button>
        </div>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Family: {model.details.family}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge>{model.details.parameterSize}</Badge>
          <Badge>{model.size}</Badge>
        </div>
      </div>
      <div className="flex justify-between items-center mt-4">
        <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
          Updated: {model.modified}
        </p>
        <button
          onClick={onViewDetails}
          className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-dark1 dark:text-light1 hover:underline"
        >
          <Info size={14} /> Details
        </button>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  model,
  onConfirm,
  onCancel,
}: {
  model: ParsedModel;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-base-dark/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-light dark:bg-surface-dark w-full max-w-md rounded-2xl shadow-xl border border-border-light dark:border-border-dark">
        <div className="p-6">
          <h3 className="font-display text-lg font-bold text-text-light dark:text-text-dark">
            Delete Model
          </h3>
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-2">
            Are you sure you want to delete <b>{model.name}</b>? This action
            cannot be undone.
          </p>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ModelDetailsModal Component
function ModelDetailsModal({
  model,
  onClose,
}: {
  model: ParsedModel;
  onClose: () => void;
}) {
  const jsonString = JSON.stringify(model.rawInfo, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const handleDownloadInfo = () => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${model.name}-info.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <div className="fixed inset-0 bg-base-dark/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-light dark:bg-surface-dark w-full max-w-2xl rounded-2xl shadow-xl border border-border-light dark:border-border-dark max-h-[80vh] flex flex-col">
        <div className="p-4 flex justify-between items-center border-b border-border-light dark:border-border-dark">
          <h3 className="font-display text-lg font-bold text-text-light dark:text-text-dark">
            {model.name}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-x-6 gap-y-4 text-sm">
            <div className="font-semibold text-text-light dark:text-text-dark">
              Family
            </div>
            <div className="font-semibold text-text-light dark:text-text-dark">
              {model.details.family}
            </div>

            <div className="font-semibold text-text-light dark:text-text-dark">
              Parameter Size
            </div>
            <div className="font-semibold text-text-light dark:text-text-dark">
              {model.details.parameterSize}
            </div>

            <div className="font-semibold text-text-light dark:text-text-dark">
              Quantization
            </div>
            <div className="font-semibold text-text-light dark:text-text-dark">
              {model.details.quantization}
            </div>

            <div className="font-semibold text-text-light dark:text-text-dark">
              File Size
            </div>
            <div className="font-semibold text-text-light dark:text-text-dark">
              {model.size}
            </div>

            <div className="font-semibold text-text-light dark:text-text-dark">
              Capabilities
            </div>
            <div className="flex flex-wrap gap-2">
              {model.capabilities.length > 0 ? (
                model.capabilities.map((cap) => <Badge key={cap}>{cap}</Badge>)
              ) : (
                <span className="text-text-light-sub dark:text-text-dark-sub">
                  None specified
                </span>
              )}
            </div>
          </div>

          <div className="mt-6">
            <h4 className="text-md font-semibold mb-2 text-text-light dark:text-text-dark">
              Full Configuration
            </h4>
            <pre className="bg-tertiary-light dark:bg-tertiary-dark p-4 rounded-lg text-xs overflow-x-auto border border-border-light dark:border-border-dark">
              <code className="text-text-light-sub dark:text-text-dark-sub">
                {jsonString}
              </code>
            </pre>
          </div>
        </div>

        <div className="p-4 bg-secondary-light/50 dark:bg-secondary-dark/50 border-t border-border-light dark:border-border-dark mt-auto">
          <button
            onClick={handleDownloadInfo}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 hover:bg-tertiary-light hover:dark:bg-tertiary-dark dark:text-text-dark text-text-light font-semibold rounded-lg bg-surface-light dark:bg-surface-dark transition-colors"
          >
            <Download size={16} />
            Download Raw JSON
          </button>
        </div>
      </div>
    </div>
  );
}
