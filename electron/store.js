import Store from "electron-store";

const store = new Store();

export function getSelectedModel() {
    return store.get("selectedModel", "");
}

export function setSelectedModel(model) {
    store.set("selectedModel", model);
}
