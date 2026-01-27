import { getStore } from "@/utils/store";

export interface FavoriteLocation {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  methodId: number;
  label?: string; // Optional custom label (e.g., "Home", "Work")
  createdAt: number;
}

const MAX_FAVORITES = 10;
const STORE_KEY = "favoriteLocations";

// Module-level state so all callers share the same reactive data
const favorites = ref<FavoriteLocation[]>([]);
const isLoaded = ref(false);

export function useFavoriteLocations() {

  // Generate unique ID
  function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  // Load favorites from store
  async function loadFavorites(): Promise<void> {
    try {
      const store = await getStore();
      const saved = await store.get<FavoriteLocation[]>(STORE_KEY);
      if (Array.isArray(saved)) {
        favorites.value = saved;
      }
      isLoaded.value = true;
    } catch (e) {
      console.warn("[useFavoriteLocations] Failed to load favorites:", e);
      isLoaded.value = true;
    }
  }

  // Save favorites to store
  async function saveFavorites(): Promise<void> {
    try {
      const store = await getStore();
      await store.set(STORE_KEY, favorites.value);
      if (store.save) await store.save();
    } catch (e) {
      console.warn("[useFavoriteLocations] Failed to save favorites:", e);
    }
  }

  // Add a new favorite location
  async function addFavorite(location: Omit<FavoriteLocation, 'id' | 'createdAt'>): Promise<boolean> {
    // Check if already exists
    const exists = favorites.value.some(
      f => f.city.toLowerCase() === location.city.toLowerCase() &&
           f.countryCode === location.countryCode
    );

    if (exists) {
      return false;
    }

    // Check max limit
    if (favorites.value.length >= MAX_FAVORITES) {
      return false;
    }

    const newFavorite: FavoriteLocation = {
      ...location,
      id: generateId(),
      createdAt: Date.now(),
    };

    favorites.value.push(newFavorite);
    await saveFavorites();
    return true;
  }

  // Remove a favorite by ID
  async function removeFavorite(id: string): Promise<void> {
    const index = favorites.value.findIndex(f => f.id === id);
    if (index !== -1) {
      favorites.value.splice(index, 1);
      await saveFavorites();
    }
  }

  // Update a favorite's label
  async function updateFavoriteLabel(id: string, label: string): Promise<void> {
    const favorite = favorites.value.find(f => f.id === id);
    if (favorite) {
      favorite.label = label || undefined;
      await saveFavorites();
    }
  }

  // Check if a location is favorited
  function isFavorite(city: string, countryCode: string): boolean {
    return favorites.value.some(
      f => f.city.toLowerCase() === city.toLowerCase() &&
           f.countryCode === countryCode
    );
  }

  // Get a favorite by city and country
  function getFavorite(city: string, countryCode: string): FavoriteLocation | undefined {
    return favorites.value.find(
      f => f.city.toLowerCase() === city.toLowerCase() &&
           f.countryCode === countryCode
    );
  }

  // Reorder favorites
  async function reorderFavorites(fromIndex: number, toIndex: number): Promise<void> {
    const [removed] = favorites.value.splice(fromIndex, 1);
    favorites.value.splice(toIndex, 0, removed);
    await saveFavorites();
  }

  // Clear all favorites
  async function clearFavorites(): Promise<void> {
    favorites.value = [];
    await saveFavorites();
  }

  // Load once on first init
  if (!isLoaded.value) {
    void loadFavorites();
  }

  return {
    favorites: computed(() => favorites.value),
    isLoaded,
    loadFavorites,
    addFavorite,
    removeFavorite,
    updateFavoriteLabel,
    isFavorite,
    getFavorite,
    reorderFavorites,
    clearFavorites,
    MAX_FAVORITES,
  };
}
