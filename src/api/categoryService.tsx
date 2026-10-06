import type { Category, SqliteRunResult } from "../types/Goals";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const categoryService = {
  getCategories: async (): Promise<Category[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("category:get-all");
  },
  deleteCategory: async (id: number) => {
    checkElectron();
    await window.electron.ipcRenderer.invoke("category:delete", id);
  },
  addCategory: async (
    name: string,
    color: string,
  ): Promise<SqliteRunResult> => {
    checkElectron();
    const category = {
      name: name,
      color: color,
    };
    return await window.electron.ipcRenderer.invoke("category:add", category);
  },
  updateCategory: async (name: string, color: string) => {
    checkElectron();
    const category = {
      name: name,
      color: color,
    };
    await window.electron.ipcRenderer.invoke("category:update", category);
  },
};
