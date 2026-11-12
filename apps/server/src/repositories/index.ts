import type { Database } from "../db/database.ts";
import { ListingRepository } from "./listing-repository.ts";
import { SearchItemRepository } from "./search-item-repository.ts";
import { SearchRepository } from "./search-repository.ts";
import {
  ApiUsageRepository,
  CacheRepository,
  FavouriteRepository,
  KeyValueRepository,
  MatchListRepository,
  PushSubscriptionRepository,
  SettingsRepository,
} from "./simple-repositories.ts";

export function createRepositories(db: Database) {
  return {
    searches: new SearchRepository(db),
    searchItems: new SearchItemRepository(db),
    listings: new ListingRepository(db),
    favourites: new FavouriteRepository(db),
    matchLists: new MatchListRepository(db),
    settings: new SettingsRepository(db),
    secrets: new KeyValueRepository(db, "secrets"),
    appState: new KeyValueRepository(db, "app_state"),
    apiUsage: new ApiUsageRepository(db),
    pushSubscriptions: new PushSubscriptionRepository(db),
    cache: new CacheRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
