// Lightweight in-renderer event bus for appearance settings that other
// mounted components (e.g. TitleBar) need to react to live, without
// forcing a full `window.location.reload()`.

export const PATH_ON_TITLEBAR_EVENT = "appearance:path-on-titlebar-changed";

export const emitPathOnTitlebarChange = (value: boolean) => {
  window.dispatchEvent(
    new CustomEvent<boolean>(PATH_ON_TITLEBAR_EVENT, { detail: value })
  );
};

export const onPathOnTitlebarChange = (
  callback: (value: boolean) => void
) => {
  const handler = (e: Event) => {
    callback((e as CustomEvent<boolean>).detail);
  };
  window.addEventListener(PATH_ON_TITLEBAR_EVENT, handler);
  return () => window.removeEventListener(PATH_ON_TITLEBAR_EVENT, handler);
};
