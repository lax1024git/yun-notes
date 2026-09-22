import { LazyStore } from '@tauri-apps/plugin-store'

/** Single shared settings file — avoid two LazyStore instances overwriting each other. */
export const appStore = new LazyStore('settings.json')
