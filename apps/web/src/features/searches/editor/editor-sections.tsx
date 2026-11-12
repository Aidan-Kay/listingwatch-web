import { EBAY_CONDITIONS, EBAY_ITEM_LOCATIONS, EBAY_SITES, VINTED_CONDITIONS, VINTED_SITES } from "@listingwatch/shared/marketplaces";
import { EBAY_FORMATS, type EbayFormat } from "@listingwatch/shared/schemas";
import { parseSearchUrl } from "@listingwatch/shared/url-import";
import { ExternalLink, Link2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useCategoryConditions, useMatchLists } from "@/api/hooks";
import { ColourSwatches } from "@/components/colour-swatches";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { countryName, flag, plural } from "@/lib/format";
import { CategoryPicker } from "./category-picker";
import { applyImport, type DraftErrors, type SearchDraft } from "./draft";
import { FilterRows } from "./filter-rows";
import { EditorSection, FormField } from "./form-field";
import { MultiSelect } from "./multi-select";

export interface SectionProps {
  draft: SearchDraft;
  update: (patch: Partial<SearchDraft>) => void;
  errors: DraftErrors;
}

const FORMAT_LABELS: Record<EbayFormat, string> = { all: "All listings", auction: "Auctions only", buy_now: "Buy It Now only" };

/** Paste a search page's link to fill everything in. Offered first, because it's the quickest way. */
export function UrlImportSection({ draft, onImport, editing }: { draft: SearchDraft; onImport: (next: SearchDraft) => void; editing: boolean }) {
  const [url, setUrl] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const run = (): void => {
    const result = parseSearchUrl(url);
    if (!result.ok) return setProblem(result.reason);
    if (editing && result.search.source !== draft.source) return setProblem(`This search is on ${draft.source === "ebay" ? "eBay" : "Vinted"}; paste a link from there`);
    setProblem(null);
    setUrl("");
    onImport(applyImport(draft, result.search, editing));
  };
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-3">
      <Field data-invalid={problem ? true : undefined}>
        <FieldLabel htmlFor="import-url" className="flex items-center gap-1.5">
          <Link2 className="size-4" /> {editing ? "Update from a search page" : "Start from a search page"}
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id="import-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), run())}
            placeholder="Paste an eBay or Vinted search link"
            inputMode="url"
          />
          <Button variant="secondary" onClick={run} disabled={url.trim() === ""}>
            Fill in
          </Button>
        </div>
        <p className={problem ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {problem ?? "Search on eBay or Vinted with the filters you want, then copy the address from your browser."}
        </p>
      </Field>
    </div>
  );
}

export function BasicsSection({ draft, update, errors, editing }: SectionProps & { editing: boolean }) {
  const sites = draft.source === "ebay" ? EBAY_SITES : VINTED_SITES;
  return (
    <EditorSection title="Search">
      <ToggleGroup
        type="single"
        variant="outline"
        value={draft.source}
        onValueChange={(value) => value && update({ source: value as SearchDraft["source"], site: "UK", category: null, conditions: [], filters: [] })}
        disabled={editing}
        className="self-start"
        aria-label="Marketplace"
      >
        <ToggleGroupItem value="ebay">eBay</ToggleGroupItem>
        <ToggleGroupItem value="vinted">Vinted</ToggleGroupItem>
      </ToggleGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="name" label="Name" error={errors.name}>
          <Input id="name" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Switch OLED" />
        </FormField>
        <FormField id="site" label="Site">
          <Select value={draft.site} onValueChange={(site) => update({ site, category: draft.source === "ebay" ? null : draft.category, conditions: draft.source === "ebay" ? [] : draft.conditions })}>
            <SelectTrigger id="site" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sites.map((site) => (
                <SelectItem key={site.code} value={site.code}>
                  {flag(site.code)} {site.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <FormField id="keywords" label="Keywords" description="Sent to the marketplace's own search. Leave empty to watch a whole category." error={errors.keywords}>
        <Input id="keywords" value={draft.keywords} onChange={(e) => update({ keywords: e.target.value })} placeholder="e.g. nintendo switch oled" />
      </FormField>
    </EditorSection>
  );
}

export function MarketplaceFiltersSection(props: SectionProps) {
  const { draft, update, errors } = props;
  return (
    <EditorSection title="Marketplace filters" description="Applied by the marketplace, so they cost nothing extra.">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="minPrice" label="Min price" error={errors.minPrice}>
          <Input id="minPrice" inputMode="decimal" value={draft.minPrice} onChange={(e) => update({ minPrice: e.target.value })} placeholder="No minimum" />
        </FormField>
        <FormField id="maxPrice" label="Max price" error={errors.maxPrice}>
          <Input id="maxPrice" inputMode="decimal" value={draft.maxPrice} onChange={(e) => update({ maxPrice: e.target.value })} placeholder="No maximum" />
        </FormField>
      </div>
      {draft.source === "ebay" ? <EbayFilters {...props} /> : <VintedFilters {...props} />}
    </EditorSection>
  );
}

function EbayFilters({ draft, update, errors }: SectionProps) {
  const conditions = useCategoryConditions(draft.site, draft.category);
  const options = draft.category === null ? EBAY_CONDITIONS : (conditions.data?.conditions ?? EBAY_CONDITIONS);
  const setCategory = (category: string | null): void => update({ category, conditions: [] });
  return (
    <>
      <FormField id="category" label="Category" error={errors.category}>
        <CategoryPicker id="category" site={draft.site} value={draft.category} onChange={setCategory} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="conditions" label="Condition" description={draft.category && conditions.data && !conditions.data.categorySpecific ? "eBay has no list for this category; showing every condition." : undefined}>
          <MultiSelect id="conditions" options={options} value={draft.conditions} onChange={(c) => update({ conditions: c })} placeholder="Any condition" loading={conditions.isLoading} />
        </FormField>
        <FormField id="format" label="Buying format">
          <Select value={draft.format} onValueChange={(format) => update({ format: format as EbayFormat })}>
            <SelectTrigger id="format" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EBAY_FORMATS.map((format) => (
                <SelectItem key={format} value={format}>
                  {FORMAT_LABELS[format]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <FormField id="location" label="Item location">
        <Select value={draft.itemLocation ?? "any"} onValueChange={(v) => update({ itemLocation: v === "any" ? null : v })}>
          <SelectTrigger id="location" className="w-full sm:w-1/2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Anywhere</SelectItem>
            {EBAY_ITEM_LOCATIONS.map((code) => (
              <SelectItem key={code} value={code}>
                {flag(code)} {countryName(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField id="aspects" label="Item specifics" description={draft.category ? "eBay aspects, like Platform: Sony PlayStation 2." : "Choose a category to filter by item specifics."} error={errors.filters}>
        {draft.category !== null && (
          <FilterRows rows={draft.filters} onChange={(filters) => update({ filters })} namePlaceholder="Aspect, e.g. Platform" valuesPlaceholder="Values, comma-separated" addLabel="Add item specific" />
        )}
      </FormField>
    </>
  );
}

function VintedFilters({ draft, update, errors }: SectionProps) {
  const site = VINTED_SITES.find((s) => s.code === draft.site);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="vintedCategory"
          label="Category ID"
          error={errors.category}
          description={
            <a href={`https://${site?.domain ?? "www.vinted.co.uk"}/catalog`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
              Easier: filter on Vinted and paste the link <ExternalLink className="size-3" />
            </a>
          }
        >
          <Input id="vintedCategory" inputMode="numeric" value={draft.category ?? ""} onChange={(e) => update({ category: e.target.value.trim() === "" ? null : e.target.value.trim() })} placeholder="Any category" />
        </FormField>
        <FormField id="vintedConditions" label="Condition">
          <MultiSelect id="vintedConditions" options={VINTED_CONDITIONS} value={draft.conditions} onChange={(c) => update({ conditions: c })} placeholder="Any condition" />
        </FormField>
      </div>
      <FormField id="vintedFilters" label="Catalogue filters" description="Vinted's filter parameters, e.g. brand_ids or video_game_platform_ids." error={errors.filters}>
        <FilterRows rows={draft.filters} onChange={(filters) => update({ filters })} namePlaceholder="Parameter" valuesPlaceholder="IDs, comma-separated" addLabel="Add filter" />
      </FormField>
    </>
  );
}

/** Filters the marketplaces can't do, applied by ListingWatch to every result. */
export function ResultFiltersSection({ draft, update, errors }: SectionProps) {
  const lists = useMatchLists();
  const toggle = (id: string, on: boolean): void => update({ includeListIds: on ? [...draft.includeListIds, id] : draft.includeListIds.filter((l) => l !== id) });
  return (
    <EditorSection title="Result filters" description="Checked by ListingWatch against every listing's title.">
      <FormField id="excludes" label="Exclude words" description="Comma-separated. Listings whose title contains any of these are skipped." error={errors.excludeKeywords}>
        <Textarea id="excludes" rows={2} value={draft.excludeKeywords} onChange={(e) => update({ excludeKeywords: e.target.value })} placeholder="e.g. broken, faulty, spares or repairs" />
      </FormField>
      <Field>
        <FieldLabel>Match lists</FieldLabel>
        {lists.data && lists.data.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {lists.data.map((list) => (
              <label key={list.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm has-[[data-state=checked]]:border-primary">
                <Checkbox checked={draft.includeListIds.includes(list.id)} onCheckedChange={(checked) => toggle(list.id, checked === true)} />
                <span className="min-w-0 flex-1 truncate">{list.name}</span>
                <span className="text-xs text-muted-foreground">{plural(list.terms.length, "term")}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            None yet. <Link to="/lists" className="underline">Create a match list</Link> to keep only titles that match your terms.
          </p>
        )}
        {draft.includeListIds.length > 0 && <p className="text-sm text-muted-foreground">Only listings whose title matches a term from a checked list are kept.</p>}
      </Field>
    </EditorSection>
  );
}

export function NotificationsSection({ draft, update, errors }: SectionProps) {
  return (
    <EditorSection title="Notifications and appearance">
      <label className="flex items-center justify-between gap-4">
        <span className="text-sm">Notify me about new listings</span>
        <Switch checked={draft.notify} onCheckedChange={(notify) => update({ notify })} />
      </label>
      <FormField id="maxNotifyPrice" label="Only notify up to" description="Listings above this still reach the feed, just silently." error={errors.maxNotifyPrice}>
        <Input id="maxNotifyPrice" inputMode="decimal" value={draft.maxNotifyPrice} onChange={(e) => update({ maxNotifyPrice: e.target.value })} placeholder="Any price" className="sm:w-1/2" disabled={!draft.notify} />
      </FormField>
      <Field>
        <FieldLabel>Colour</FieldLabel>
        <ColourSwatches value={draft.color} onChange={(color) => update({ color })} allowNone />
      </Field>
    </EditorSection>
  );
}

export function AdvancedSection({ draft, update, errors }: SectionProps) {
  return (
    <EditorSection title="Polling interval" description="Leave empty to use the interval from Settings. Polls happen at a random point in the range.">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="minInterval" label="Every at least (seconds)" error={errors.minInterval}>
          <Input id="minInterval" inputMode="numeric" value={draft.minInterval} onChange={(e) => update({ minInterval: e.target.value })} placeholder="Default" />
        </FormField>
        <FormField id="maxInterval" label="Every at most (seconds)" error={errors.maxInterval}>
          <Input id="maxInterval" inputMode="numeric" value={draft.maxInterval} onChange={(e) => update({ maxInterval: e.target.value })} placeholder="Default" />
        </FormField>
      </div>
    </EditorSection>
  );
}
