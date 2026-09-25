import type { LucideIcon } from "lucide-react";

// Shared "nothing here yet" block — replaces the plain dashed-border
// paragraph that was hand-rolled slightly differently on every page.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center">
      {Icon && <Icon className="size-6 text-muted-foreground/60" />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
