import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newFilterRow, type DraftFilterRow } from "./draft";

/** Name + comma-separated values rows (eBay aspects, Vinted catalogue filters). */
export function FilterRows({
  rows,
  onChange,
  namePlaceholder,
  valuesPlaceholder,
  addLabel,
}: {
  rows: DraftFilterRow[];
  onChange: (rows: DraftFilterRow[]) => void;
  namePlaceholder: string;
  valuesPlaceholder: string;
  addLabel: string;
}) {
  const update = (id: number, patch: Partial<DraftFilterRow>): void => onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.id} className="flex gap-2">
          <Input value={row.name} onChange={(e) => update(row.id, { name: e.target.value })} placeholder={namePlaceholder} aria-label="Filter name" className="w-2/5" />
          <Input value={row.values} onChange={(e) => update(row.id, { values: e.target.value })} placeholder={valuesPlaceholder} aria-label="Values, comma-separated" className="flex-1" />
          <Button variant="ghost" size="icon" onClick={() => onChange(rows.filter((r) => r.id !== row.id))} aria-label="Remove filter">
            <X />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="self-start" onClick={() => onChange([...rows, newFilterRow()])}>
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}
