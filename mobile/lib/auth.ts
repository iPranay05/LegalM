import * as SecureStore from "expo-secure-store";
import api from "./api";

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  district?: string;
  state?: string;
}

export async function login(email: string, password: string): Promise<User> {
  const res = await api.post("/auth/login", { email, password });
  await SecureStore.setItemAsync("auth_token", res.data.access_token);
  await SecureStore.setItemAsync("auth_user", JSON.stringify(res.data.user));
  return res.data.user;
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
  role?: string;
  district?: string;
  state?: string;
}): Promise<User> {
  const res = await api.post("/auth/register", payload);
  return res.data;
}

export async function logout() {
  await SecureStore.deleteItemAsync("auth_token");
  await SecureStore.deleteItemAsync("auth_user");
}

export async function getStoredUser(): Promise<User | null> {
  const raw = await SecureStore.getItemAsync("auth_user");
  return raw ? JSON.parse(raw) : null;
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await SecureStore.getItemAsync("auth_token");
  return !!token;
}
