export {};

declare global {
  interface Window {
    /** Safari/older-Chrome prefix, feature-detected in useSpeechRecognition. */
    webkitSpeechRecognition?: typeof SpeechRecognition;
    /** Safari prefix, feature-detected in useVoiceRecorder. */
    webkitAudioContext?: typeof AudioContext;
  }
}
