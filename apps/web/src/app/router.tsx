import { createBrowserRouter } from "react-router";
import { FeedPage } from "@/features/feed/feed-page";
import { AppShell } from "./app-shell";
import { RouteError } from "./route-error";

// The feed is where the app opens, so it's in the main bundle; the other pages load when first visited.
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <FeedPage /> },
      { path: "searches", lazy: async () => ({ Component: (await import("@/features/searches/searches-page")).SearchesPage }) },
      { path: "lists", lazy: async () => ({ Component: (await import("@/features/lists/match-lists-page")).MatchListsPage }) },
      { path: "favourites", lazy: async () => ({ Component: (await import("@/features/favourites/favourites-page")).FavouritesPage }) },
      { path: "settings", lazy: async () => ({ Component: (await import("@/features/settings/settings-page")).SettingsPage }) },
      { path: "*", element: <FeedPage /> },
    ],
  },
]);
