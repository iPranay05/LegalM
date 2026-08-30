import axios from "axios";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

// API base URL is read from app.json → expo.extra.apiBaseUrl at runtime.
// To change the backend address, update that one field in app.json and
// restart Metro — no need to touch any TypeScript file.
//
// When running in Expo Go / development builds the value comes from your
// local app.json. In a production build it is baked in at build time.
const extraUrl: string | undefined = Constants.expoConfig?.extra?.apiBaseUrl;
export const API_BASE_URL = extraUrl ?? "http://10.78.123.24:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Attach JWT token to every request — same auth scheme as the web app
// (Authorization: Bearer <token>), backed by SecureStore instead of
// localStorage.
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A token signed with an old SECRET_KEY (or an expired token) must not be
// retried forever. Clear it so the next launch sends the user to login.
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
