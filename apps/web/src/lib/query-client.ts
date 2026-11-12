import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Live events keep cached data fresh; refetch only on reconnect or invalidation.
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failures, error) => failures < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});
