import { create } from 'zustand';

interface State {
  colors: Array<number> | null;
  positions: Array<number> | null;
  measures: Array<number> | null;
}

// 2. Create the store using the curried form: create<T>()(...)
const useStore = create<State>()((set) => ({
  // Initial state
  colors: null,
  positions: null,
  measures: null,
}))

export default useStore;
