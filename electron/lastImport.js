import Store from "electron-store";

// Each profile's latest import, { at, source, ids, edited }, kept across
// restarts so it can still be undone (KAN-74). Ids only, never entry text; a
// newer import replaces it, so only the latest can be undone. Deleting the
// profile drops it (KAN-441).
let store; // lazy: importing this file must not open the store
const imports = () =>
  (store ??= new Store({ name: "last-import", defaults: { users: {} } }));
export const getLast = (userId) => imports().get(`users.${userId}`) ?? null;
export const setLast = (userId, last) =>
  last
    ? imports().set(`users.${userId}`, last)
    : imports().delete(`users.${userId}`);
