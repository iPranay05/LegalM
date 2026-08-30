import { useEffect } from "react";
import { useRouter } from "expo-router";
import { isAuthenticated } from "../lib/auth";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const authed = await isAuthenticated();
      if (authed) {
        router.replace("/(tabs)/dashboard");
      } else {
        router.replace("/(auth)/login");
      }
    })();
  }, []);

  return null;
}
