import { create } from 'zustand';
import * as THREE from 'three';

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
  setAllPointCloudColors: (rgb: [number, number, number]) => void;
  setPositions: (postions: Float32Array) => void
  setActiveNavItem: (item: ActiveNavItem) => void;
  setControlMode: (mode: ControlMode) => void;
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

  setActiveNavItem: (activeNavItem) => set({ activeNavItem }),
  setControlMode: (controlMode) => set({ controlMode }),

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
