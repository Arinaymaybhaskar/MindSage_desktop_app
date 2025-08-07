import { useState, useRef, useEffect } from 'react';

// --- Custom Hook: useVoiceRecorder ---
// This hook encapsulates all the logic for recording audio and capturing waveform data.
export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [waveformHistory, setWaveformHistory] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Function to start the recording
  const startRecording = async () => {
    try {
      setRecordingBlob(null);
      setWaveformHistory([]);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
      
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);

      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordingBlob(blob);
        chunksRef.current = [];
        stream.getTracks().forEach(track => track.stop());
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingTime(prevTime => prevTime + 1);
      }, 1000);

      animateWaveform();

    } catch (error) {
      console.error("Error starting recording:", error);
    }
  };

  // Function to stop the recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    setIsRecording(false);
    setIsPaused(false);
  };

  // Function to toggle pause/resume
  const togglePauseResume = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime(prevTime => prevTime + 1);
      }, 1000);
      animateWaveform();
    } else {
      mediaRecorderRef.current.pause();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    setIsPaused(!isPaused);
  };

  // Waveform animation loop during recording
  const animateWaveform = () => {
    if (analyserRef.current && dataArrayRef.current) {
      analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
      
      let sumSquares = 0.0;
      for (const amplitude of dataArrayRef.current) {
          const normalizedAmplitude = (amplitude / 128.0) - 1.0;
          sumSquares += normalizedAmplitude * normalizedAmplitude;
      }
      const rms = Math.sqrt(sumSquares / dataArrayRef.current.length);
      const scaledRms = rms * 300;

      setWaveformHistory(prev => [...prev, scaledRms]);
      
      animationFrameRef.current = requestAnimationFrame(animateWaveform);
    }
  };

  const resetRecording = () => {
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setRecordingBlob(null);
    setWaveformHistory([]);
    chunksRef.current = [];
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  };

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
       if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
        }
    };
  }, []);

  return {
    isRecording,
    isPaused,
    recordingTime,
    recordingBlob,
    waveformHistory,
    startRecording,
    stopRecording,
    togglePauseResume,
    resetRecording
  };
}
