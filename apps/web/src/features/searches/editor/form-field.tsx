import type { ReactNode } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

/** A labelled control with optional help text and a validation message. */
export function FormField({ id, label, description, error, children, className }: { id: string; label: string; description?: ReactNode; error?: string | undefined; children: ReactNode; className?: string }) {
  return (
    <Field data-invalid={error ? true : undefined} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

/** A titled group of fields in the editor. */
export function EditorSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t pt-5 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
