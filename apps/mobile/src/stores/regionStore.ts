import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface RegionStore {
  city: string | null;    // null = show all regions
  setCity: (city: string | null) => void;
}

export const useRegionStore = create<RegionStore>()(
  persist(
    (set) => ({
      city: null,
      setCity: (city) => set({ city }),
    }),
    { name: 'region-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);
