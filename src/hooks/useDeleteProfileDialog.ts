import { useSyncExternalStore } from "react";
import { deleteProfileDialog } from "../utils/deleteProfileDialog";

export const useDeleteProfileDialog = () =>
  useSyncExternalStore(
    deleteProfileDialog.subscribe,
    deleteProfileDialog.get,
    deleteProfileDialog.get,
  );
