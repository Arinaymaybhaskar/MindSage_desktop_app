// The splash runs sandboxed with no Node: the only thing it gets from the
// main process is the status line, through the bridge splashPreload.js
// exposes.
const statusEl = document.getElementById("status");
window.splash?.onStatus((text) => {
  if (statusEl && typeof text === "string") statusEl.textContent = text;
});
