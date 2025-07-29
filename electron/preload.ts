import { contextBridge, ipcRenderer } from 'electron'

// Define the shape of the API we want to expose
export interface IElectronAPI {
  saveFile: () => Promise<{ success: boolean; message: string; }>
}

// Expose the API to the renderer process
const electronAPI: IElectronAPI = {
  saveFile: () => ipcRenderer.invoke('dialog:saveFile'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)