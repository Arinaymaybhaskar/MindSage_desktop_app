import React from "react";
import { Mic, StopCircle, Pause, Play, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import LiveWaveformVisualizer from "./liveWaveformVisualizer";
// Import the new playback visualizer
import PlaybackWaveformVisualizer from "./PlaybackWaveformVisualizer";

// --- Define the props type to match the hook's return value ---
type VoiceRecorderProps = {
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  recordingBlob: Blob | null;
  waveformHistory: number[];
  startRecording: () => void;
  stopRecording: () => void;
  togglePauseResume: () => void;
  resetRecording: () => void;
};

const formatTime = (time: number): string => {
  const minutes = Math.floor(time / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(time % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const VoiceRecorderUI: React.FC<VoiceRecorderProps> = ({
  isRecording,
  isPaused,
  recordingTime,
  recordingBlob,
  waveformHistory,
  startRecording,
  stopRecording,
  togglePauseResume,
  resetRecording,
}) => {
  const hasRecording = recordingBlob !== null;

  const renderPrimaryButton = () => {
    if (isRecording || isPaused) {
      return (
        <button
          type="button"
          onClick={togglePauseResume}
          className="flex items-center justify-center w-14 h-14 bg-white dark:bg-gray-200 text-gray-900 rounded-full shadow-lg transform transition-transform hover:scale-105"
          aria-label={isPaused ? "Resume recording" : "Pause recording"}
        >
          {isPaused ? <Play size={28} className="ml-1" /> : <Pause size={28} />}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={startRecording}
        className="flex items-center justify-center w-14 h-14 bg-red-600 text-white rounded-full shadow-lg transform transition-transform hover:scale-105"
        aria-label="Start recording"
      >
        <Mic size={28} />
      </button>
    );
  };

  return (
    <div className="w-full bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-4">
      {/* Top Row: Controls and Timer */}
      <div className="w-full flex items-center justify-between">
        {/* Left-side secondary button (Stop/Delete) */}
        <div className="w-14 flex justify-start">
          <AnimatePresence>
            {(isRecording || isPaused) && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                type="button"
                onClick={stopRecording}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                aria-label="Stop recording"
              >
                <StopCircle size={28} />
              </motion.button>
            )}
            {hasRecording && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                type="button"
                onClick={resetRecording}
                className="p-2 rounded-full text-gray-500 hover:bg-red-100 dark:hover:bg-red-500/10 hover:text-red-500"
                aria-label="Delete recording"
              >
                <Trash2 size={28} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Center Primary Button */}
        <div className="flex-shrink-0">{renderPrimaryButton()}</div>

        {/* Right-side Timer / Status */}
        <div className="w-14 flex justify-end">
          <AnimatePresence mode="wait">
            <motion.div
              key={isRecording || isPaused ? "time" : "idle"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-right"
            >
              {isRecording || isPaused ? (
                <div className="text-xl font-mono text-gray-900 dark:text-gray-100">
                  {formatTime(recordingTime)}
                </div>
              ) : (
                <div className="w-14 h-7" /> // Placeholder to prevent layout shift
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom Row: Waveform Visualizer */}
      <div className="w-full h-16 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={hasRecording ? "playback" : "live"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full"
          >
            {isRecording || isPaused ? (
              <LiveWaveformVisualizer waveformHistory={waveformHistory} />
            ) : hasRecording ? (
              // Use the new PlaybackWaveformVisualizer here
              <PlaybackWaveformVisualizer audioBlob={recordingBlob} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
                Click the mic to start recording
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default VoiceRecorderUI;
