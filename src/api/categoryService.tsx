import type { Category, SqliteRunResult } from "../types/Goals";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const categoryService = {
  getCategories: async (
    authMode: "online" | "offline",
    token: string,
  ): Promise<Category[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "category:get-all",
      authMode,
      token,
    );
  },
  deleteCategory: async (
    authMode: "online" | "offline",
    token: string,
    id: number,
  ) => {
    checkElectron();
    await window.electron.ipcRenderer.invoke(
      "category:delete",
      authMode,
      token,
      id,
    );
  },
  addCategory: async (
    authMode: "online" | "offline",
    token: string,
    name: string,
    color: string,
  ): Promise<SqliteRunResult> => {
    checkElectron();
    const category = {
      name: name,
      color: color,
    };
    return await window.electron.ipcRenderer.invoke(
      "category:add",
      authMode,
      token,
      category,
    );
  },
  updateCategory: async (
    authMode: "online" | "offline",
    token: string,
    name: string,
    color: string,
  ) => {
    checkElectron();
    const category = {
      name: name,
      color: color,
    };
    await window.electron.ipcRenderer.invoke(
      "category:update",
      authMode,
      token,
      category,
    );
  },
};
