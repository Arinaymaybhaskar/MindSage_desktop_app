import { useEffect, useRef, useState } from "react";

type UseSpeechRecognitionReturn = {
  listening: boolean;
  transcript: string;
  startListening: () => void;
};

export const useSpeechRecognition = (): UseSpeechRecognitionReturn => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const spokenText = e.results[0][0].transcript;
      setTranscript(spokenText);
    };

    recognition.onerror = (e) => {
      console.error("[SpeechRecognition] ❌ Error occurred:", e);
      setListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  const startListening = () => {
    if (!recognitionRef.current) {
      console.warn("[SpeechRecognition] No recognition instance found");
      return;
    }
    setTranscript("");
    recognitionRef.current.start();
  };

  return {
    listening,
    transcript,
    startListening,
  };
};
