import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: (): Promise<{ path: string; buffer: ArrayBuffer }[]> =>
    ipcRenderer.invoke('open-file-dialog'),
  readFileAsBuffer: (path: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('read-file-as-buffer', path),
})
