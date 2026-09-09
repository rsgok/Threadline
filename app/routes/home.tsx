import { redirect } from "react-router";
import { entryPath } from "../lib/navigation";
import type { Route } from "./+types/home";

export function clientLoader({ request }: Route.ClientLoaderArgs) {
  return redirect(entryPath(new URL(request.url)));
}
export default function Home() {
  return null;
}
