import { EBAY_CONDITIONS, ebaySite } from "@listingwatch/shared/marketplaces";
import type { CategoryConditions, EbayCategory } from "@listingwatch/shared/schemas";
import type { CacheRepository } from "../../repositories/simple-repositories.ts";
import { MarketplaceError } from "../errors.ts";
import { BROWSE_SEARCH_URL } from "./search.ts";
import type { EbayClient } from "./client.ts";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Bump when the cached shape changes. */
const CACHE_VERSION = 1;

interface TaxonomyNode {
  category?: { categoryId?: string; categoryName?: string };
  childCategoryTreeNodes?: TaxonomyNode[];
  leafCategoryTreeNode?: boolean;
}

/**
 * Flatten eBay's nested category tree into rows, keeping every level. The root
 * (the marketplace itself) is skipped, so top-level categories have depth 1.
 */
export function flattenCategoryTree(root: TaxonomyNode | undefined): EbayCategory[] {
  const rows: EbayCategory[] = [];
  const visit = (node: TaxonomyNode, depth: number, parentId: string | null): void => {
    const id = node.category?.categoryId;
    const children = node.childCategoryTreeNodes ?? [];
    if (id && node.category?.categoryName) {
      rows.push({ id, name: node.category.categoryName, depth, parentId, leaf: node.leafCategoryTreeNode ?? children.length === 0 });
    }
    for (const child of children) visit(child, depth + 1, id ?? null);
  };
  for (const topLevel of root?.childCategoryTreeNodes ?? []) visit(topLevel, 1, null);
  return rows;
}

/** eBay's category tree and per-category condition lists, cached for a week. */
export class EbayTaxonomy {
  private readonly client: EbayClient;
  private readonly cache: CacheRepository;
  private readonly now: () => Date;

  constructor(client: EbayClient, cache: CacheRepository, now: () => Date) {
    this.client = client;
    this.cache = cache;
    this.now = now;
  }

  async categories(siteCode: string, signal: AbortSignal): Promise<EbayCategory[]> {
    const site = ebaySite(siteCode);
    if (!site) throw new MarketplaceError("config", `Unknown eBay site ${siteCode}`);
    const key = `ebay:categories:v${CACHE_VERSION}:${site.code}`;
    const cached = this.cache.get<EbayCategory[]>(key, this.now().toISOString());
    if (cached) return cached;
    const tree = await this.client.getJson<{ rootCategoryNode?: TaxonomyNode }>(
      `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${site.categoryTreeId}`,
      { marketplaceId: site.marketplaceId, signal, timeoutMs: 60_000 },
    );
    const categories = flattenCategoryTree(tree.rootCategoryNode);
    if (categories.length === 0) throw new MarketplaceError("bad-response", "eBay returned an empty category tree");
    this.cache.set(key, categories, this.expiry());
    return categories;
  }

  /**
   * The conditions eBay offers in a category, read from a one-item search's
   * condition refinements. Falls back to the site-wide list when eBay has none.
   */
  async conditions(siteCode: string, categoryId: string, signal: AbortSignal): Promise<CategoryConditions> {
    const site = ebaySite(siteCode);
    if (!site) throw new MarketplaceError("config", `Unknown eBay site ${siteCode}`);
    const key = `ebay:conditions:v${CACHE_VERSION}:${site.code}:${categoryId}`;
    const cached = this.cache.get<CategoryConditions>(key, this.now().toISOString());
    if (cached) return cached;
    const params = new URLSearchParams({ category_ids: categoryId, limit: "1", fieldgroups: "CONDITION_REFINEMENTS" });
    const data = await this.client.getJson<{ refinement?: { conditionDistributions?: { conditionId?: string; condition?: string }[] } }>(
      `${BROWSE_SEARCH_URL}?${params}`,
      { marketplaceId: site.marketplaceId, signal, attempts: 2 },
    );
    const conditions = (data.refinement?.conditionDistributions ?? [])
      .filter((d) => d.conditionId)
      .map((d) => ({ id: String(d.conditionId), label: d.condition ?? `Condition ${d.conditionId}` }));
    const result: CategoryConditions =
      conditions.length > 0 ? { conditions, categorySpecific: true } : { conditions: [...EBAY_CONDITIONS], categorySpecific: false };
    this.cache.set(key, result, this.expiry());
    return result;
  }

  private expiry(): string {
    return new Date(this.now().getTime() + CACHE_TTL_MS).toISOString();
  }
}
