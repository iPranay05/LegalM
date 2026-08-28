import axios from "axios";
import * as SecureStore from "expo-secure-store";

// Change this to your machine's local IP when testing on a physical device
export const API_BASE_URL = "http://192.168.0.193:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Attach JWT token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
