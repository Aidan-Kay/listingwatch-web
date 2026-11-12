import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface Option {
  id: string;
  label: string;
}

/** Pick any number of options; the trigger summarises the choice. */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  id,
  loading = false,
}: {
  options: readonly Option[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  id?: string;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((option) => value.includes(option.id));
  const summary = selected.length === 0 ? placeholder : selected.length <= 2 ? selected.map((o) => o.label).join(", ") : `${selected[0]!.label} +${selected.length - 1} more`;
  const toggle = (optionId: string): void => onChange(value.includes(optionId) ? value.filter((v) => v !== optionId) : [...value, optionId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal" disabled={loading}>
          <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>{loading ? "Loading…" : summary}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((option) => {
                const checked = value.includes(option.id);
                return (
                  <CommandItem key={option.id} value={option.id} onSelect={() => toggle(option.id)} aria-checked={checked} role="menuitemcheckbox">
                    <span className={cn("flex size-4 items-center justify-center rounded-sm border", checked && "border-primary bg-primary text-primary-foreground")}>
                      {checked && <Check className="size-3" />}
                    </span>
                    {option.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {value.length > 0 && (
            <div className="border-t p-1">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
                Clear selection
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
