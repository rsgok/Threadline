import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";

export default defineConfig({
  plugins: [reactRouter()],
  publicDir: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(
      [
        "/api",
        "/health",
        "/assets",
        "/landing",
        "/landing.css",
        "/landing.js",
      ].map((prefix) => [
        prefix,
        {
          target: `http://127.0.0.1:${process.env.REWIND_WEB_PORT || "43139"}`,
          changeOrigin: true,
          configure(proxy) {
            proxy.on("proxyReq", (request, incoming) => {
              // The dev server is the browser's origin; the local API checks its own origin.
              if (
                incoming.headers.origin &&
                !["http://127.0.0.1:5173", "http://localhost:5173"].includes(
                  incoming.headers.origin,
                )
              )
                return;
              request.setHeader(
                "origin",
                `http://127.0.0.1:${process.env.REWIND_WEB_PORT || "43139"}`,
              );
            });
          },
        },
      ]),
    ),
  },
  build: { target: "safari16.4", sourcemap: false },
});
