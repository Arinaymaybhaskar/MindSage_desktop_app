import type { Category, SqliteRunResult } from "../types/Goals";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const categoryService = {
  getCategories: async (token: string): Promise<Category[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("category:get-all", token);
  },
  deleteCategory: async (token: string, id: number) => {
    checkElectron();
    await window.electron.ipcRenderer.invoke("category:delete", token, id);
  },
  addCategory: async (
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
      token,
      category,
    );
  },
  updateCategory: async (token: string, name: string, color: string) => {
    checkElectron();
    const category = {
      name: name,
      color: color,
    };
    await window.electron.ipcRenderer.invoke(
      "category:update",
      token,
      category,
    );
  },
};
