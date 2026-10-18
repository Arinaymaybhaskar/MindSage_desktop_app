// Tells the window how services ended up ("services-ready" with
// { degraded, search }), whichever happens first: the vector index settling or
// the window being created. Kept free of electron imports so it can be tested.
//
// Each distinct status is sent once; a later status (the index coming up on a
// retry) is sent again; a reload gets the last one replayed.

export function createServiceAnnouncer({ getWindow, onSent = () => {} }) {
  let status = null;
  let sent = null;

  const flush = () => {
    if (!status || sent === status) return false;
    const win = getWindow();
    if (!win || win.isDestroyed()) return false;
    sent = status;
    win.webContents.send("services-ready", status);
    onSent(status);
    return true;
  };

  return {
    // The index start ended (or was retried) with this status.
    update(next) {
      status = next;
      return flush();
    },
    // Call once the window exists, in case the status arrived before it.
    flush,
    // A renderer that loads later, or reloads, still needs to hear the
    // current status, even one that arrived while no window could take it.
    replay(win) {
      if (status && win && !win.isDestroyed())
        win.webContents.send("services-ready", status);
    },
  };
}
