import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const EXAMPLES: { term: string; meaning: string }[] = [
  { term: "Paper Mario Thousand Year Door", meaning: "Every word somewhere in the title, in any order. Spacing differences are fine: “FIFA 21” matches “FIFA21”." },
  { term: "Final Fantasy (7|VII)", meaning: "Either alternative. Commas work too, and groups can nest." },
  { term: "\"Legend of Zelda\"", meaning: "Quoted words must appear together, in this order." },
  { term: "Mario Party -Jamboree", meaning: "A leading minus rejects the term when that word (or quoted phrase, or group) is in the title." },
];

/** The term syntax, a click away rather than taking up the editor. */
export function SyntaxHelpButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <CircleHelp /> How terms match
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(32rem,70svh)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto">
        <dl className="grid gap-3 text-sm">
          {EXAMPLES.map((example) => (
            <div key={example.term}>
              <dt>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{example.term}</code>
              </dt>
              <dd className="mt-1 text-muted-foreground">{example.meaning}</dd>
            </div>
          ))}
          <p className="text-muted-foreground">Accents and punctuation are ignored, and “VII” won't match “VIII”. One term per line, or separate terms with commas.</p>
        </dl>
      </PopoverContent>
    </Popover>
  );
}
