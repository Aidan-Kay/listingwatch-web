import type { EbayCategory } from "@listingwatch/shared/schemas";
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useEbayCategories } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api";

const RESULT_LIMIT = 60;

interface CategoryIndex {
  byId: Map<string, EbayCategory>;
  children: Map<string | null, EbayCategory[]>;
  paths: Map<string, string>;
}

/**
 * eBay category picker across the site's full tree. Typing searches every
 * category by its whole path ("toys corgi" finds Toys › Diecast › Corgi);
 * without a query you browse level by level.
 */
export function CategoryPicker({ site, value, onChange, id }: { site: string; value: string | null; onChange: (id: string | null) => void; id?: string }) {
  const [open, setOpen] = useState(false);
  const categories = useEbayCategories(site, open || value !== null);
  const index = useMemo(() => buildIndex(categories.data ?? []), [categories.data]);
  const label = value === null ? "Any category" : (index.paths.get(value) ?? (categories.isLoading ? "Loading…" : `Category ${value}`));

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} variant="outline" role="combobox" aria-expanded={open} className="min-w-0 flex-1 justify-between font-normal">
            <span className="truncate">{label}</span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(32rem,calc(100vw-2rem))] p-0" align="start">
          {categories.isLoading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Spinner /> Loading eBay's categories (first time only)…
            </div>
          ) : categories.isError ? (
            <p className="p-4 text-sm text-destructive">{errorMessage(categories.error)}</p>
          ) : (
            <CategoryCommand
              index={index}
              value={value}
              onSelect={(id) => {
                onChange(id);
                setOpen(false);
              }}
            />
          )}
        </PopoverContent>
      </Popover>
      {value !== null && (
        <Button variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Clear category">
          <X />
        </Button>
      )}
    </div>
  );
}

function CategoryCommand({ index, value, onSelect }: { index: CategoryIndex; value: string | null; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState<string | null>(() => (value ? (index.byId.get(value)?.parentId ?? null) : null));
  const results = useMemo(() => searchCategories(index, query), [index, query]);
  const current = browsing ? index.byId.get(browsing) : undefined;
  const levelItems = index.children.get(browsing) ?? [];

  return (
    <Command shouldFilter={false}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search categories…" />
      <CommandList className="max-h-80">
        <CommandEmpty>No categories match.</CommandEmpty>
        {query.trim() !== "" ? (
          <CommandGroup heading={`${results.length === RESULT_LIMIT ? `First ${RESULT_LIMIT}` : results.length} matches`}>
            {results.map((category) => (
              <CommandItem key={category.id} value={category.id} onSelect={() => onSelect(category.id)}>
                <span className="truncate">{index.paths.get(category.id)}</span>
                {category.id === value && <Check className="ml-auto" />}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <CommandGroup heading={current ? index.paths.get(current.id) : "All categories"}>
            {current && (
              <>
                <CommandItem value="__back" onSelect={() => setBrowsing(current.parentId)}>
                  <ChevronLeft /> Back
                </CommandItem>
                <CommandItem value="__use" onSelect={() => onSelect(current.id)} className="font-medium">
                  <Check /> Use “{current.name}”
                </CommandItem>
              </>
            )}
            {levelItems.map((category) => (
              <CommandItem
                key={category.id}
                value={category.id}
                // Choosing a leaf selects it; choosing a branch opens it, with "Use" offered at the top.
                onSelect={() => (category.leaf ? onSelect(category.id) : setBrowsing(category.id))}
              >
                <span className="truncate">{category.name}</span>
                {category.id === value && <Check className="ml-auto" />}
                {!category.leaf && <ChevronRight className="ml-auto opacity-50" />}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

function buildIndex(categories: readonly EbayCategory[]): CategoryIndex {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const children = new Map<string | null, EbayCategory[]>();
  for (const category of categories) {
    const siblings = children.get(category.parentId) ?? [];
    siblings.push(category);
    children.set(category.parentId, siblings);
  }
  const paths = new Map<string, string>();
  const pathOf = (category: EbayCategory): string => {
    const cached = paths.get(category.id);
    if (cached) return cached;
    const parent = category.parentId ? byId.get(category.parentId) : undefined;
    const path = parent ? `${pathOf(parent)} › ${category.name}` : category.name;
    paths.set(category.id, path);
    return path;
  };
  categories.forEach(pathOf);
  return { byId, children, paths };
}

/** Every word must appear in the category's path; leaves and shorter paths rank first. */
function searchCategories(index: CategoryIndex, query: string): EbayCategory[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const matches: EbayCategory[] = [];
  for (const [id, path] of index.paths) {
    const lower = path.toLowerCase();
    if (words.every((word) => lower.includes(word))) matches.push(index.byId.get(id)!);
  }
  return matches.sort((a, b) => Number(b.leaf) - Number(a.leaf) || a.depth - b.depth).slice(0, RESULT_LIMIT);
}
