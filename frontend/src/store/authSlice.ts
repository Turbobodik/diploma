import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import type { LoginRequest, RegisterRequest, UserProfile } from '../models/api';
import { authService } from '../services/authService';
import { normalizeAxiosError } from '../services/httpClient';
import { tokenStorage } from '../services/tokenStorage';
import { pushToast } from './uiSlice';

export interface AuthState {
  token: string | null;
  user: UserProfile | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  initialized: boolean;
  error: string | null;
}

const initialState: AuthState = {
  token: tokenStorage.getToken(),
  user: null,
  status: 'idle',
  initialized: false,
  error: null,
};

export const restoreSession = createAsyncThunk<UserProfile | null, void, { rejectValue: string }>(
  'auth/restoreSession',
  async (_, { rejectWithValue }) => {
    const token = tokenStorage.getToken();
    if (!token) {
      return null;
    }
    try {
      return await authService.getMe();
    } catch (err) {
      tokenStorage.clearToken();
      return rejectWithValue(normalizeAxiosError(err).message);
    }
  },
);

export const loginUser = createAsyncThunk<
  { token: string; user: UserProfile },
  LoginRequest,
  { rejectValue: string }
>('auth/login', async (payload, { dispatch, rejectWithValue }) => {
  try {
    const res = await authService.login(payload);
    tokenStorage.setToken(res.token);
    dispatch(
      pushToast({
        variant: 'success',
        title: `Welcome back, ${res.user.display_name}`,
      }),
    );
    return { token: res.token, user: res.user };
  } catch (err) {
    return rejectWithValue(normalizeAxiosError(err).message);
  }
});

export const registerUser = createAsyncThunk<
  { token: string; user: UserProfile },
  RegisterRequest,
  { rejectValue: string }
>('auth/register', async (payload, { dispatch, rejectWithValue }) => {
  try {
    const res = await authService.register(payload);
    tokenStorage.setToken(res.token);
    dispatch(
      pushToast({
        variant: 'success',
        title: 'Account created',
        description: `Signed in as ${res.user.display_name}`,
      }),
    );
    return { token: res.token, user: res.user };
  } catch (err) {
    return rejectWithValue(normalizeAxiosError(err).message);
  }
});

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      tokenStorage.clearToken();
      state.token = null;
      state.user = null;
      state.status = 'idle';
      state.error = null;
      state.initialized = true;
    },
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.user = action.payload;
        if (!action.payload) {
          state.token = null;
        }
        state.initialized = true;
      })
      .addCase(restoreSession.rejected, (state) => {
        state.status = 'idle';
        state.token = null;
        state.user = null;
        state.initialized = true;
      })
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.initialized = true;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'Sign-in failed.';
      })
      .addCase(registerUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.initialized = true;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'Registration failed.';
      });
  },
});

export const { logout, clearAuthError } = authSlice.actions;

export default authSlice.reducer;
