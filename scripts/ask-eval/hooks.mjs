// Module hook: send "electron" and "electron-store" to stubs.mjs.
const stubs = new URL("./stubs.mjs", import.meta.url).href;
export function resolve(specifier, context, next) {
  if (specifier === "electron" || specifier === "electron-store") {
    return { url: `${stubs}?${specifier}`, shortCircuit: true };
  }
  return next(specifier, context);
}
