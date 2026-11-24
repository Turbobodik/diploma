import type { AuthResponse, LoginRequest, RegisterRequest, UserProfile } from '../models/api';
import { httpClient } from './httpClient';

export const authService = {
  async register(payload: RegisterRequest): Promise<AuthResponse> {
    const { data } = await httpClient.post<AuthResponse>('/api/v1/auth/register', payload);
    return data;
  },

  async login(payload: LoginRequest): Promise<AuthResponse> {
    const { data } = await httpClient.post<AuthResponse>('/api/v1/auth/login', payload);
    return data;
  },

  async getMe(): Promise<UserProfile> {
    const { data } = await httpClient.get<UserProfile>('/api/v1/auth/me');
    return data;
  },
};
