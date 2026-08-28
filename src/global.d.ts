export {};

declare global {
  interface Window {
    /** Safari prefix, feature-detected in useVoiceRecorder. */
    webkitAudioContext?: typeof AudioContext;
  }
}
