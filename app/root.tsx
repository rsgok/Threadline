import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";
import type { Route } from "./+types/root";
import "./base.css";
import "../web/threadline.css";
import "../web/buttons.css";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Threadline · 思续</title>
        <link rel="icon" href="/assets/threadline-icon.png" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return (
    <main className="boot-screen">
      <img src="/assets/threadline-icon.png" alt="" width="56" height="56" />
      <h1>Threadline</h1>
      <p role="status">Loading · 正在打开</p>
    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unable to open Threadline";
  return (
    <main className="boot-screen">
      <h1>Threadline</h1>
      <p role="alert">{message}</p>
      <a href="/">Reload · 重新打开</a>
    </main>
  );
}

export default function Root() {
  return <Outlet />;
}
