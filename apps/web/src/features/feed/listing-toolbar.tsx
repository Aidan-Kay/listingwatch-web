import type { Search } from "@listingwatch/shared/schemas";
import { LayoutGrid, LayoutList, Rows3, SearchIcon, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CardSize } from "./listing-card";
import { activeFilterCount, DEFAULT_FILTERS, SORT_LABELS, SORT_ORDERS, type ListingFilters, type SortOrder } from "./listing-filters";

interface ToolbarProps {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
  searches: readonly Search[];
  size: CardSize;
  onSizeChange: (size: CardSize) => void;
}

/** Text filter, narrowing selects, sort and card size. On phones the selects live in a sheet. */
export function ListingToolbar(props: ToolbarProps) {
  const { filters, onFiltersChange } = props;
  const set = (patch: Partial<ListingFilters>): void => onFiltersChange({ ...filters, ...patch });
  const active = activeFilterCount(filters);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputGroup className="min-w-0 flex-1 basis-56 md:max-w-xs">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput value={filters.text} onChange={(e) => set({ text: e.target.value })} placeholder="Filter by title" aria-label="Filter by title" />
        {filters.text && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" onClick={() => set({ text: "" })} aria-label="Clear text filter">
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      <div className="hidden flex-wrap items-center gap-2 lg:flex">
        <FilterSelects {...props} set={set} />
      </div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className="lg:hidden">
            <SlidersHorizontal />
            Filters
            {active > 0 && <Badge className="h-5 px-1.5">{active}</Badge>}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="gap-0">
          <SheetHeader>
            <SheetTitle>Filter and sort</SheetTitle>
          </SheetHeader>
          <div className="grid gap-3 p-4 pt-0 [&_button[role=combobox]]:w-full">
            <FilterSelects {...props} set={set} />
          </div>
        </SheetContent>
      </Sheet>
      {active > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onFiltersChange({ ...DEFAULT_FILTERS, sort: filters.sort })}>
          Clear filters
        </Button>
      )}
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={props.size}
        onValueChange={(value) => value && props.onSizeChange(value as CardSize)}
        className="ml-auto"
        aria-label="Card size"
      >
        <ToggleGroupItem value="small" aria-label="Compact list">
          <Rows3 />
        </ToggleGroupItem>
        <ToggleGroupItem value="medium" aria-label="Medium cards">
          <LayoutGrid />
        </ToggleGroupItem>
        <ToggleGroupItem value="large" aria-label="Large cards">
          <LayoutList />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

function FilterSelects({ filters, searches, set }: ToolbarProps & { set: (patch: Partial<ListingFilters>) => void }) {
  const sorted = [...searches].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <Select value={filters.source} onValueChange={(source) => set({ source: source as ListingFilters["source"] })}>
        <SelectTrigger aria-label="Marketplace" className="w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All marketplaces</SelectItem>
          <SelectItem value="ebay">eBay</SelectItem>
          <SelectItem value="vinted">Vinted</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sorted.some((s) => s.id === filters.searchId) ? filters.searchId : "all"} onValueChange={(searchId) => set({ searchId })}>
        <SelectTrigger aria-label="Search" className="w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All searches</SelectItem>
          {sorted.map((search) => (
            <SelectItem key={search.id} value={search.id}>
              {search.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.format} onValueChange={(format) => set({ format: format as ListingFilters["format"] })}>
        <SelectTrigger aria-label="Buying format" className="w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All formats</SelectItem>
          <SelectItem value="Auction">Auction</SelectItem>
          <SelectItem value="Buy It Now">Buy It Now</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.sort} onValueChange={(sort) => set({ sort: sort as SortOrder })}>
        <SelectTrigger aria-label="Sort" className="w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_ORDERS.map((order) => (
            <SelectItem key={order} value={order}>
              {SORT_LABELS[order]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
