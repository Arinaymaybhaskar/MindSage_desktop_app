import { useEffect, useRef, useState } from "react";
import {
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
  Volume2Icon,
  MicIcon,
  StopCircleIcon,
} from "lucide-react";

type AudioPlayerProps = {
  setAudioBlob: (blob: Blob) => void;
};

export const AudioPlayer = ({ setAudioBlob }: AudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const progressRef = useRef<HTMLInputElement | null>(null);
  const volumeRef = useRef<HTMLInputElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Attach audio listeners when audioUrl changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      setDuration(audio.duration || 0);
      setCurrentTime(audio.currentTime || 0);
    };

    const setAudioTime = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.addEventListener("loadedmetadata", setAudioData);
    audio.addEventListener("timeupdate", setAudioTime);

    return () => {
      audio.removeEventListener("loadedmetadata", setAudioData);
      audio.removeEventListener("timeupdate", setAudioTime);
    };
  }, [audioUrl]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (!isPlaying) {
      audioRef.current.play();
      setIsPlaying(true);
      animationRef.current = requestAnimationFrame(whilePlaying);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }
  };

  const whilePlaying = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
    animationRef.current = requestAnimationFrame(whilePlaying);
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const newTime = parseFloat(e.target.value);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = () => {
    if (!audioRef.current || !volumeRef.current) return;
    const newVolume = parseFloat(volumeRef.current.value);
    setVolume(newVolume);
    audioRef.current.volume = newVolume;
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  // === Recording logic ===

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    audioChunks.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks.current, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    };

    mediaRecorder.start();
    setIsRecording(true);
    setIsPaused(false);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream
      .getTracks()
      .forEach((track) => track.stop());
    setIsRecording(false);
    setAudioBlob(new Blob(audioChunks.current, { type: "audio/webm" }));
    setIsPaused(false);
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  const handleRecordingControls = () => {
    if (!isRecording) {
      startRecording();
    } else if (!isPaused) {
      pauseRecording();
    } else {
      resumeRecording();
    }
  };

  return (
    <div className="w-full bg-white rounded-xl">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          controls={false}
        />
      )}

      {/* Recording Controls */}
      <div className="flex justify-end mb-2 gap-2">
        {isRecording && (
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center justify-center p-2 rounded-full bg-red-100 text-red-600"
          >
            <StopCircleIcon size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={handleRecordingControls}
          className={`flex items-center justify-center p-2 rounded-full ${
            isRecording
              ? isPaused
                ? "bg-yellow-100 text-yellow-600"
                : "bg-red-100 text-red-600"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          <MicIcon
            size={18}
            className={isRecording && !isPaused ? "animate-pulse" : ""}
          />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <input
          ref={progressRef}
          type="range"
          className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#6C5CE7]"
          value={currentTime}
          min="0"
          max={duration || 0}
          step="0.01"
          onChange={handleProgressChange}
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <div>{formatTime(currentTime)}</div>
          <div>{formatTime(duration)}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            type="button"
            className="text-gray-600 hover:text-[#6C5CE7] transition-colors"
          >
            <SkipBackIcon size={20} />
          </button>
          <button
            type="button"
            onClick={togglePlayPause}
            className="w-12 h-12 flex items-center justify-center bg-[#6C5CE7] text-white rounded-full hover:bg-[#5a4bd1] transition-colors"
          >
            {isPlaying ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
          </button>
          <button
            type="button"
            className="text-gray-600 hover:text-[#6C5CE7] transition-colors"
          >
            <SkipForwardIcon size={20} />
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={toggleMute}
            className="text-gray-600 hover:text-[#6C5CE7] transition-colors"
          >
            {isMuted ? <VolumeIcon size={20} /> : <Volume2Icon size={20} />}
          </button>
          <input
            ref={volumeRef}
            type="range"
            className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#6C5CE7]"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
          />
        </div>
      </div>
    </div>
  );
};
