import React from "react";
import { Mic, StopCircle, Pause, Play, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import LiveWaveformVisualizer from "./liveWaveformVisualizer";
import PlaybackWaveformVisualizer from "./PlaybackWaveformVisualizer";

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
          className="flex items-center justify-center w-14 h-14 bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark rounded-full shadow-lg border border-border-light dark:border-border-dark transform transition-transform hover:scale-105"
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
        className="flex items-center justify-center w-14 h-14 bg-danger text-white rounded-full shadow-lg transform transition-transform hover:scale-105"
        aria-label="Start recording"
      >
        <Mic size={28} />
      </button>
    );
  };

  return (
    <div className="w-full bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-xl p-4 flex flex-col gap-4">
      {/* Top Row: Controls and Timer */}
      <div className="w-full flex items-center justify-between">
        <div className="w-14 flex justify-start">
          <AnimatePresence>
            {(isRecording || isPaused) && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                type="button"
                onClick={stopRecording}
                className="p-2 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-secondary-light dark:hover:bg-secondary-dark transition-colors"
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
                className="p-2 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-danger/10 hover:text-danger transition-colors"
                aria-label="Delete recording"
              >
                <Trash2 size={28} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-shrink-0">{renderPrimaryButton()}</div>

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
                <div className="text-xl font-mono text-text-light dark:text-text-dark">
                  {formatTime(recordingTime)}
                </div>
              ) : (
                <div className="w-14 h-7" />
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
              <PlaybackWaveformVisualizer audioBlob={recordingBlob} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-text-light-sub dark:text-text-dark-sub">
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
