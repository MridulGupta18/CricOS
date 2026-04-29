import { create } from 'zustand';
import { SearchResult } from '@cricket-os/shared';

interface SearchStore {
  recentSearches: SearchResult[];
  addRecentSearch: (result: SearchResult) => void;
  clearRecent: () => void;
}

export const useSearchStore = create<SearchStore>((set) => ({
  recentSearches: [],
  addRecentSearch: (result) =>
    set((s) => ({
      recentSearches: [result, ...s.recentSearches.filter((r) => r.id !== result.id)].slice(0, 10),
    })),
  clearRecent: () => set({ recentSearches: [] }),
}));
