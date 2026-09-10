import { useLayoutEffect, useState } from "react";
import {
  useLocation,
  useNavigate,
  useNavigation,
  useNavigationType,
} from "react-router";

type Trail = { keys: string[]; index: number };
const storageKey = "threadline-page-history";

// Track only this app's visited entries, never navigate out of a deep-linked window.
export function usePageHistory() {
  const location = useLocation();
  const action = useNavigationType();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [trail, setTrail] = useState<Trail>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (
        Array.isArray(saved?.keys) &&
        saved.keys.every((key: unknown) => typeof key === "string")
      ) {
        const index = saved.keys.indexOf(location.key);
        if (index >= 0) return { keys: saved.keys, index };
      }
    } catch {
      /* Start from this entry when storage is unavailable. */
    }
    return { keys: [location.key], index: 0 };
  });
  useLayoutEffect(() => {
    setTrail((previous) => {
      if (previous.keys[previous.index] === location.key) return previous;
      if (action === "POP") {
        const index = previous.keys.indexOf(location.key);
        return index < 0
          ? { keys: [location.key], index: 0 }
          : { ...previous, index };
      }
      if (action === "REPLACE") {
        const keys = [...previous.keys];
        keys[previous.index] = location.key;
        return { ...previous, keys };
      }
      return {
        keys: [...previous.keys.slice(0, previous.index + 1), location.key],
        index: previous.index + 1,
      };
    });
  }, [location.key, action]);
  useLayoutEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(trail));
    } catch {
      /* Keep in memory. */
    }
  }, [trail]);
  const ready = navigation.state === "idle";
  const canBack = ready && trail.index > 0;
  const canForward = ready && trail.index < trail.keys.length - 1;
  return {
    canBack,
    canForward,
    back: () => {
      if (canBack) void navigate(-1);
    },
    forward: () => {
      if (canForward) void navigate(1);
    },
  };
}
