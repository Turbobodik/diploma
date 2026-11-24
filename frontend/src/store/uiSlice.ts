import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { DisplayScale, ThemeMode, ToastMessage, ToastVariant } from '../models/ui';
import { tokenStorage } from '../services/tokenStorage';

export interface UiState {
  theme: ThemeMode;
  scale: DisplayScale;
  toasts: ToastMessage[];
  globalError: string | null;
}

const initialState: UiState = {
  theme: tokenStorage.getTheme(),
  scale: tokenStorage.getScale(),
  toasts: [],
  globalError: null,
};

let toastSeq = 0;

function createToastId(): string {
  toastSeq += 1;
  return `toast-${Date.now()}-${toastSeq}`;
}

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<ThemeMode>) {
      state.theme = action.payload;
      tokenStorage.setTheme(action.payload);
    },
    toggleTheme(state) {
      const next: ThemeMode = state.theme === 'light' ? 'dark' : 'light';
      state.theme = next;
      tokenStorage.setTheme(next);
    },
    setScale(state, action: PayloadAction<DisplayScale>) {
      state.scale = action.payload;
      tokenStorage.setScale(action.payload);
    },
    pushToast(
      state,
      action: PayloadAction<{ variant: ToastVariant; title: string; description?: string }>,
    ) {
      state.toasts.push({
        id: createToastId(),
        variant: action.payload.variant,
        title: action.payload.title,
        description: action.payload.description,
      });
      if (state.toasts.length > 5) {
        state.toasts.shift();
      }
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload);
    },
    setGlobalError(state, action: PayloadAction<string | null>) {
      state.globalError = action.payload;
    },
  },
});

export const { setTheme, toggleTheme, setScale, pushToast, dismissToast, setGlobalError } =
  uiSlice.actions;

export default uiSlice.reducer;
