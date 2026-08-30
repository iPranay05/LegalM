import axios from "axios";
import * as SecureStore from "expo-secure-store";

// Change this to your machine's local IP when testing on a physical device
export const API_BASE_URL = "http://192.168.0.201:8000";

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
