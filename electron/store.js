import Store from 'electron-store';

export const modelStore = new Store({
    name: 'model-settings', // this will create model-settings.json in app data
    defaults: {
        selectedModels: {}
    }
});