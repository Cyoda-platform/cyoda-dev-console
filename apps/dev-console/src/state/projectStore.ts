import { create } from "zustand";
import type { DevProject, AppConfig } from "@cyoda/workflow-project-model";

interface ProjectStore {
  config: AppConfig | null;
  active: DevProject | null;
  setActive: (p: DevProject) => void;
  clearActive: () => void;
  setConfig: (c: AppConfig) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  config: null,
  active: null,
  setActive: (active) => set({ active }),
  clearActive: () => set({ active: null }),
  setConfig: (config) => set({ config }),
}));
