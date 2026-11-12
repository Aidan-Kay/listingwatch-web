import { DEFAULT_ACCENT_COLOUR } from "@listingwatch/shared/schemas";
import { Ban, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const PRESET_COLOURS = [
  { value: DEFAULT_ACCENT_COLOUR, name: "Indigo" },
  { value: "#f97316", name: "Orange" },
  { value: "#ef4444", name: "Red" },
  { value: "#eab308", name: "Yellow" },
  { value: "#22c55e", name: "Green" },
  { value: "#14b8a6", name: "Teal" },
  { value: "#06b6d4", name: "Cyan" },
  { value: "#3b82f6", name: "Blue" },
  { value: "#a855f7", name: "Purple" },
  { value: "#ec4899", name: "Pink" },
];

/** Preset colours plus a custom one; optionally "none". */
export function ColourSwatches({ value, onChange, allowNone = false }: { value: string | null; onChange: (value: string | null) => void; allowNone?: boolean }) {
  const isCustom = value !== null && !PRESET_COLOURS.some((c) => c.value.toLowerCase() === value.toLowerCase());
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colour">
      {allowNone && (
        <Swatch selected={value === null} onSelect={() => onChange(null)} label="No colour">
          <Ban className="size-4 text-muted-foreground" />
        </Swatch>
      )}
      {PRESET_COLOURS.map((colour) => (
        <Swatch key={colour.value} selected={value?.toLowerCase() === colour.value} onSelect={() => onChange(colour.value)} label={colour.name} colour={colour.value} />
      ))}
      <label className={cn("relative flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-dashed", isCustom && "border-solid border-foreground")} title="Custom colour">
        <span className="size-5 rounded-full" style={{ background: isCustom ? value : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} />
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={value ?? DEFAULT_ACCENT_COLOUR} onChange={(e) => onChange(e.target.value)} aria-label="Custom colour" />
      </label>
    </div>
  );
}

function Swatch({ selected, onSelect, label, colour, children }: { selected: boolean; onSelect: () => void; label: string; colour?: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={cn("flex size-7 items-center justify-center rounded-full border-2 border-transparent outline-none focus-visible:ring-3 focus-visible:ring-ring/50", selected && "border-foreground")}
    >
      {colour ? (
        <span className="flex size-5 items-center justify-center rounded-full" style={{ background: colour }}>
          {selected && <Check className="size-3 text-white" />}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
