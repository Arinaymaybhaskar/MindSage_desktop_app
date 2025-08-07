// src/components/VoiceRecorder.tsx

import React, { useRef } from 'react';
import { Mic, StopCircle, Pause, Play } from 'lucide-react';
import LiveWaveformVisualizer from './liveWaveformVisualizer'; // Assuming you have this component
import PlaybackWaveformVisualizer from './playbackWaveformVisualizer'; // Assuming you have this component

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

const VoiceRecorder: React.FC<VoiceRecorderProps> = (props) => {
  const {
    isRecording,
    isPaused,
    recordingTime,
    recordingBlob,
    waveformHistory,
    startRecording,
    stopRecording,
    togglePauseResume,
  } = props;
  
  const audioRef = useRef<HTMLAudioElement>(null);

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60).toString().padStart(2, '0');
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  let heading;
  if(isRecording) {
    heading = 'Recording...';
  } else if(isPaused) {
    heading = 'Paused';
  } else if (recordingBlob) {
    heading = "Playback";
  } else {
    heading = "Voice Recorder";
  }

  return (
    <div className="w-full max-w-md p-6 text-white bg-gray-900 rounded-2xl shadow-lg flex flex-col items-center space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{heading}</h1>
      </div>

      {/* Conditionally render the correct visualizer */}
      {isRecording || isPaused ? (
        <LiveWaveformVisualizer waveformHistory={waveformHistory} />
      ) : (
        recordingBlob && <PlaybackWaveformVisualizer waveformHistory={waveformHistory} audioRef={audioRef} />
      )}

      <p className="text-5xl font-mono tracking-tighter">
        {formatTime(recordingTime)}
      </p>

      <div className="flex items-center justify-center space-x-8 w-full">
        <button type='button' onClick={stopRecording} disabled={!isRecording && !isPaused} className="text-gray-400 disabled:text-gray-700 transition-colors">
          <StopCircle size={32} />
        </button>
        
        {!isRecording && !isPaused ? (
          <button type='button' onClick={startRecording} className="p-4 bg-red-600 rounded-full text-white shadow-lg hover:bg-red-700 transition-all duration-200 ease-in-out transform hover:scale-105">
            <Mic size={40} />
          </button>
        ) : (
          <button type='button' onClick={togglePauseResume} className="p-4 bg-white rounded-full text-black shadow-lg hover:bg-gray-200 transition-all duration-200 ease-in-out transform hover:scale-105">
            {isPaused ? <Play size={40} className="ml-1"/> : <Pause size={40} />}
          </button>
        )}
      </div>

      {/* {recordingBlob && !isRecording && (
        <div className="w-full pt-4 mt-4 border-t border-gray-700">
          <audio ref={audioRef} controls src={URL.createObjectURL(recordingBlob)} className="w-full">
            Your browser does not support the audio element.
          </audio>
        </div>
      )} */}
    </div>
  );
}

export default VoiceRecorder;