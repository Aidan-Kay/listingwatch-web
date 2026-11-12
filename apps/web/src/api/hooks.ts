import type {
  ApiUsage,
  CategoryConditions,
  EbayCategory,
  Favourite,
  FeedResponse,
  Listing,
  MatchList,
  MatchListInput,
  PollingState,
  Search,
  SearchInput,
  Settings,
  SettingsView,
} from "@listingwatch/shared/schemas";
import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

export const queryKeys = {
  searches: ["searches"] as const,
  lists: ["lists"] as const,
  feed: ["feed"] as const,
  favourites: ["favourites"] as const,
  settings: ["settings"] as const,
  polling: ["polling"] as const,
  usage: ["usage"] as const,
  categories: (site: string) => ["ebay", site, "categories"] as const,
  conditions: (site: string, categoryId: string) => ["ebay", site, "conditions", categoryId] as const,
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export const useSearches = () => useQuery({ queryKey: queryKeys.searches, queryFn: () => api<Search[]>("/searches") });
export const useMatchLists = () => useQuery({ queryKey: queryKeys.lists, queryFn: () => api<MatchList[]>("/lists") });
export const useFeed = () => useQuery({ queryKey: queryKeys.feed, queryFn: () => api<FeedResponse>("/feed") });
export const useFavourites = () => useQuery({ queryKey: queryKeys.favourites, queryFn: () => api<Favourite[]>("/favourites") });
export const useSettings = () => useQuery({ queryKey: queryKeys.settings, queryFn: () => api<SettingsView>("/settings") });
export const usePolling = () => useQuery({ queryKey: queryKeys.polling, queryFn: () => api<PollingState>("/polling") });
export const useApiUsage = () => useQuery({ queryKey: queryKeys.usage, queryFn: () => api<ApiUsage>("/ebay/usage") });

/** eBay's category tree is big and changes rarely: fetch once per site per session. */
export const useEbayCategories = (site: string, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.categories(site), queryFn: () => api<EbayCategory[]>(`/ebay/${site}/categories`), enabled, staleTime: Infinity, retry: 1 });

export const useCategoryConditions = (site: string, categoryId: string | null) =>
  useQuery({
    queryKey: queryKeys.conditions(site, categoryId ?? ""),
    queryFn: () => api<CategoryConditions>(`/ebay/${site}/categories/${categoryId}/conditions`),
    enabled: categoryId !== null,
    staleTime: Infinity,
    retry: 1,
  });

// ─── Mutations ───────────────────────────────────────────────────────────────

/** A mutation that reports failure as a toast, so no caller can forget to. */
function useAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, onSuccess?: (result: TResult, args: TArgs, client: QueryClient) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, args) => onSuccess?.(result, args, client),
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/**
 * A mutation whose effect shows at once: `apply` updates the cached query
 * before the request goes out. If the server refuses, the query is refetched so
 * the screen returns to the truth, and the failure is shown as a toast.
 */
function useOptimisticAction<TArgs, TData>(queryKey: QueryKey, fn: (args: TArgs) => Promise<unknown>, apply: (data: TData, args: TArgs) => TData) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onMutate: async (args) => {
      // A refetch already in flight would overwrite the optimistic change with stale data.
      await client.cancelQueries({ queryKey });
      client.setQueryData<TData>(queryKey, (data) => (data === undefined ? data : apply(data, args)));
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      void client.invalidateQueries({ queryKey });
    },
  });
}

function replaceSearch(client: QueryClient, search: Search): void {
  client.setQueryData<Search[]>(queryKeys.searches, (list) => list?.map((s) => (s.id === search.id ? search : s)));
}

export const useSaveSearch = () =>
  useAction(
    ({ id, config }: { id: string | null; config: SearchInput }) =>
      id === null ? api<Search>("/searches", { method: "POST", body: config }) : api<Search>(`/searches/${id}`, { method: "PUT", body: config }),
    (_search, _args, client) => void client.invalidateQueries({ queryKey: queryKeys.searches }),
  );

export const useSetSearchFlags = () =>
  useAction(
    ({ id, ...flags }: { id: string; enabled?: boolean; notify?: boolean }) => api<Search>(`/searches/${id}`, { method: "PATCH", body: flags }),
    (search, _args, client) => replaceSearch(client, search),
  );

export const useDuplicateSearch = () =>
  useAction((id: string) => api<Search>(`/searches/${id}/duplicate`, { method: "POST" }), (_s, _a, client) => void client.invalidateQueries({ queryKey: queryKeys.searches }));

export const useDeleteSearch = () =>
  useAction(
    (id: string) => api<void>(`/searches/${id}`, { method: "DELETE" }),
    (_r, id, client) => {
      client.setQueryData<Search[]>(queryKeys.searches, (list) => list?.filter((s) => s.id !== id));
    },
  );

export const useSetPaused = () =>
  useAction(
    (paused: boolean) => api<PollingState>(paused ? "/polling/pause" : "/polling/resume", { method: "POST" }),
    (state, _a, client) => {
      client.setQueryData(queryKeys.polling, state);
    },
  );

export const useSaveMatchList = () =>
  useAction(
    ({ id, input }: { id: string | null; input: MatchListInput }) =>
      id === null ? api<MatchList>("/lists", { method: "POST", body: input }) : api<MatchList>(`/lists/${id}`, { method: "PUT", body: input }),
    (_l, _a, client) => void client.invalidateQueries({ queryKey: queryKeys.lists }),
  );

export const useDeleteMatchList = () =>
  useAction((id: string) => api<void>(`/lists/${id}`, { method: "DELETE" }), (_r, _a, client) => void client.invalidateQueries({ queryKey: queryKeys.lists }));

export const useDismissListing = () =>
  useOptimisticAction<string, FeedResponse>(
    queryKeys.feed,
    (key) => api<void>(`/feed/${encodeURIComponent(key)}`, { method: "DELETE" }),
    (feed, key) => ({ ...feed, listings: feed.listings.filter((l) => l.key !== key) }),
  );

export const useClearFeed = () =>
  useOptimisticAction<void, FeedResponse>(
    queryKeys.feed,
    () => api<void>("/feed", { method: "DELETE" }),
    (feed) => ({ ...feed, listings: [] }),
  );

export const useMarkFeedSeen = () =>
  useMutation({
    mutationFn: () => api<{ seenAt: string }>("/feed/seen", { method: "POST" }),
  });

/** The server confirms with a `favourites.changed` live event, which refetches the list. */
export const useSetFavourite = () =>
  useOptimisticAction<{ listing: Listing; favourite: boolean }, Favourite[]>(
    queryKeys.favourites,
    ({ listing, favourite }) => api<void>(`/favourites/${encodeURIComponent(listing.key)}`, { method: favourite ? "PUT" : "DELETE" }),
    (favourites, { listing, favourite }) => {
      const others = favourites.filter((f) => f.listing.key !== listing.key);
      return favourite ? [{ listing, savedAt: new Date().toISOString() }, ...others] : others;
    },
  );

export const useClearFavourites = () =>
  useOptimisticAction<void, Favourite[]>(
    queryKeys.favourites,
    () => api<void>("/favourites", { method: "DELETE" }),
    () => [],
  );

export const useSaveSettings = () =>
  useAction(
    (settings: Settings) => api<SettingsView>("/settings", { method: "PUT", body: settings }),
    (view, _a, client) => {
      client.setQueryData(queryKeys.settings, view);
    },
  );
