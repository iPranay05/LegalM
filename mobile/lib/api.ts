import axios from "axios";
import * as SecureStore from "expo-secure-store";

// Same LegalM FastAPI backend the web app talks to (see web/lib/api.ts).
// Change this to your machine's LAN IP when testing on a physical device,
// e.g. "http://192.168.1.42:8000". The web app reads this from
// NEXT_PUBLIC_API_URL; Expo apps can't read a .env at runtime as easily, so
// it's set here directly.
export const API_BASE_URL = "http://192.168.16.110:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Attach JWT token to every request — same auth scheme as the web app
// (Authorization: Bearer <token>), just backed by SecureStore instead of
// localStorage.
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A token signed with an old SECRET_KEY (or an expired token) must not be
// retried forever. Clear it so the app's next launch sends the user to login.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await SecureStore.deleteItemAsync("auth_token");
      await SecureStore.deleteItemAsync("auth_user");
    }
    return Promise.reject(error);
  },
);

export default api;
