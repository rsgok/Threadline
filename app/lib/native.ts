import { useEffect } from "react";
import type { NativeCommands } from "./native.d";

export function useNativeBridge(commands: NativeCommands) {
  useEffect(() => {
    window.Threadline = commands;
    return () => {
      if (window.Threadline === commands) delete window.Threadline;
    };
  }, [commands]);
  useEffect(() => {
    let frame = 0;
    const publish = () => {
      frame = 0;
      const bridge = window.webkit?.messageHandlers?.windowChrome;
      if (!bridge) return;
      const visible = (node: Element) =>
        node.getClientRects().length > 0 &&
        getComputedStyle(node).visibility !== "hidden";
      const rect = (node: Element) => {
        const r = node.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      };
      const regions = document.querySelector("dialog[open]")
        ? []
        : [
            ...document.querySelectorAll(
              ".native-window-header,.sidebar>.brand",
            ),
          ].filter(visible);
      const exclusions = regions.flatMap((node) =>
        [...node.querySelectorAll("button,input,select,summary,a")].filter(
          visible,
        ),
      );
      bridge.postMessage({
        regions: regions.map(rect),
        exclusions: exclusions.map(rect),
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(publish);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "open", "hidden"],
    });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);
}
