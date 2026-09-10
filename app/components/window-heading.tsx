import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";

// Keep a single heading/menu instance, including focus and open-menu state.
export function WindowHeading({ children }: { children: ReactNode }) {
  const { search } = useLocation();
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const media = matchMedia("(min-width: 701px)");
    const update = () =>
      setHost(
        media.matches && new URLSearchParams(search).get("panel") !== "1"
          ? document.getElementById("window-page-heading")
          : null,
      );
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [search]);
  return host ? createPortal(children, host) : children;
}
