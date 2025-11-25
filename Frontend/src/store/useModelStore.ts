import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Model } from '../types'
import { kmsService } from '../services/kmsService'

type StoredModel = Omit<Model, 'apiKey'>

interface ModelState {
  models: StoredModel[]
  activeId: string
  addModel: (model: Model) => Promise<void>
  updateModel: (id: string, updates: Partial<Model>) => Promise<void>
  setActive: (id: string) => Promise<void>
  removeModel: (id: string) => Promise<void>
}

// Default models available in the application
const DEFAULT_MODELS: StoredModel[] = [
  {
    id: 'default',
    name: 'default',
    provider: 'default',
    requiresApiKey: false
  }
];

// Manages the collection of available models and the currently active model
export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      // Initial state with default models
      models: [...DEFAULT_MODELS],
      activeId: DEFAULT_MODELS[0].id,

      // Add a new model to the store and set its API key in cookies if provided
      addModel: async (model) => {
        const { apiKey, ...safeModel } = model as Model;

        // If there's an API key, save it to cookies
        if (apiKey && model.provider) {
          await kmsService.storeAPIKey({
            provider_name: model.provider,
            api_key: apiKey
          });
        }

        set((state) => ({
          models: [...state.models, { ...safeModel, isCustom: true }],
          activeId: model.id,
        }));
      },

      // Update an existing model
      updateModel: async (id, updates) => {
        // If updating the API key, save it to cookies
        if ('apiKey' in updates && updates.provider) {
          if (updates.apiKey) {
            await kmsService.storeAPIKey({
              provider_name: updates.provider,
              api_key: updates.apiKey
            });
          } else {
            await kmsService.deleteAPIKey(updates.provider);
          }
        }

        set((state) => ({
          models: state.models.map((m) => (m.id === id ? { ...m, ...updates } : m)),
        }));
      },

      // Set the active model by ID
      setActive: async (id) => {
        const previousModel = get().models.find(m => m.id === get().activeId);
        const newModel = get().models.find(m => m.id === id);

        // If switching TO default FROM a custom model, delete the custom model entirely
        if (newModel?.provider === 'default' && previousModel?.isCustom && previousModel?.provider) {
          await kmsService.deleteAPIKey(previousModel.provider);
          // Remove the custom model from the store
          set((state) => ({
            models: state.models.filter((m) => m.id !== previousModel.id),
            activeId: id,
          }));
        } else {
          // Just switch the active model
          set({ activeId: id });
        }
      },

      // Remove a model by ID
      removeModel: async (id) => {
        const model = get().models.find(m => m.id === id);

        // If the model has a provider, remove its API key from cookies
        if (model?.provider) {
          await kmsService.deleteAPIKey(model.provider);
        }

        set((state) => ({
          models: state.models.filter((m) => m.id !== id),
          // If removing the active model, fall back to the first available model
          activeId: state.activeId === id ? state.models[0]?.id || '' : state.activeId,
        }));
      },
    }),
    {
      name: 'model-storage',
    }
  )
)
