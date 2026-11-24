import { configureStore } from '@reduxjs/toolkit';

import authReducer from './authSlice';
import projectsReducer from './projectsSlice';
import uiReducer from './uiSlice';
import workspaceReducer from './workspaceSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    projects: projectsReducer,
    workspace: workspaceReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
