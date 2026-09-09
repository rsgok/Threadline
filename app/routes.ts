import {
  index,
  layout,
  route,
  type RouteConfig,
} from "@react-router/dev/routes";

export default [
  layout("routes/app.tsx", [
    index("routes/home.tsx"),
    route("library", "routes/library.tsx"),
    route("notes/:noteID", "routes/note.tsx"),
    route("collect/:runtime?/:threadID?", "routes/collect.tsx"),
    route("thoughts", "routes/thoughts.tsx"),
    route("thoughts/:topicID", "routes/thought.tsx"),
    route("settings", "routes/settings.tsx"),
    route("*", "routes/not-found.tsx"),
  ]),
] satisfies RouteConfig;
