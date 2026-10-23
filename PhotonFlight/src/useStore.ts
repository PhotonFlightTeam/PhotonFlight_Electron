import { create } from 'zustand';

interface State {
  colors: Float32Array | null;
  positions: Float32Array | null;
  measures: Array<number> | null;
  pinpoints: Array<number> | null;
  user: string | null;
  min: [number, number, number] | null;
  max: [number, number, number] | null;
}

// 2. Create the store using the curried form: create<T>()(...)
const useStore = create<State>()((set) => ({
  // Initial state
  colors: null,
  positions: null,
  measures: null,
  pinpoints: null,
  user: null,
  min: [0,1,0],
  max: [1,0,0],
}))

export default useStore;
