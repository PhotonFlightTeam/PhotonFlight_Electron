import { create } from 'zustand';
import * as THREE from 'three';
import type  { Plugin } from "./grpc/generated/photonflight/application/v1/Plugin"
import type { PluginStateChanged } from './grpc/generated/photonflight/application/v1/PluginStateChanged';


type ActiveNavItem = 'plugins' | 'navigation' | null;
type ControlMode = 'flight' | 'position';

interface State {
  colors: Float32Array | null;
  positions: Float32Array | null;
  measures: Array<number> | null;
  pinpoints: Array<number> | null;
  user: string | null;
  username: string | null;
  id: string | null;
  min: [number, number, number] | null;
  max: [number, number, number] | null;
  bounds: THREE.Box3 | null;
  activeNavItem: ActiveNavItem;
  controlMode: ControlMode;
  pluginList: Plugin[] | []


  setAllPointCloudColors: (rgb: [number, number, number]) => void;
  setPositions: (postions: Float32Array) => void
  setActiveNavItem: (item: ActiveNavItem) => void;
  setControlMode: (mode: ControlMode) => void;
  getPluginList: () => Promise<void>;
  togglePlugin: (enabledPlugin: Plugin) => void 
  refreshPlugins: () => void;
}

// State actions keep point-cloud color mutations in one place and give the
// renderer a fresh array so React/Zustand consumers can observe the change.
const useStore = create<State>()((set, get) => ({
  username: null,
  id: null,
  colors: null,
  positions: null,
  measures: null,
  pinpoints: null,
  user: null,
  min: [0, 1, 0],
  max: [1, 0, 0],
  bounds: null,
  activeNavItem: null,
  controlMode: 'position',
  pluginList: [],

  

  setActiveNavItem: (activeNavItem) => set({ activeNavItem }),
  setControlMode: (controlMode) => set({ controlMode }),

  // Scans the core's plugins dir (via main process) and appends plugins not already in the list
  // restart jvm? (prototype)
  // call shutdown -> 
  getPluginList: async () => {
    const found: Plugin[] = await (window as unknown as {
      electronAPI: { listCorePlugins: () => Promise<Plugin[]> };
    }).electronAPI.listCorePlugins();
    const known = new Set(get().pluginList.map((plugin) => plugin.id));
    const added = found.filter((plugin) => !known.has(plugin.id));
    if (added.length === 0) return;
    set((state) => ({ pluginList: [...state.pluginList, ...added] }));
  },

  // iterate and flip the plugins state in the list of plugins
  // finish this execute command!
togglePlugin: async (target: Plugin) => {
  await (window as unknown as {
    electronAPI: { core: { executeCommand: () => Promise<unknown> } };
  })//.electronAPI.core.executeCommand({} : PluginState)
  set((state) => ({
    pluginList: state.pluginList.map((plugin) =>
      plugin.id === target.id ? { ...plugin, enabled: !plugin.enabled } : plugin
    ),
  }));
},

refreshPlugins: () => {
  get().getPluginList()
},

setAllPointCloudColors: ([red, green, blue]) => {
    const currentColors = get().positions;
    if (!currentColors) return;

    const colors = currentColors.slice();
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = red;
      colors[i + 1] = green;
      colors[i + 2] = blue;
    }

    set((state) => ({
       colors: colors
    }))
  },

  setPositions: (positions) => {
    let newPositions = get().positions;
    newPositions = positions;
    set((state) => ({ positions: newPositions }))
  }
}))

export default useStore;
