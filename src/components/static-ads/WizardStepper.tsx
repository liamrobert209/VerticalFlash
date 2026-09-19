"use client";

// Purely presentational progress header for the static-ad project page —
// summarizes where the project actually is (derived from real project
// state, not separately tracked) so the existing section-by-section page
// reads as a guided sequence instead of an undifferentiated list of
// cards. Steps that are already done stay visible below as usual; this is
// a progress summary, not a single-panel-at-a-time view, so nothing about
// the already-working per-section components underneath had to change.

export type WizardStepStatus = "done" | "current" | "upcoming";

export interface WizardStep {
  label: string;
  status: WizardStepStatus;
}

export function WizardStepper({ steps }: { steps: WizardStep[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
      {steps.map((step, i) => (
        <li key={step.label} className="flex items-center gap-1">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
              step.status === "done"
                ? "bg-primary/15 text-primary"
                : step.status === "current"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {step.status === "done" ? "✓" : i + 1} {step.label}
          </span>
          {i < steps.length - 1 && <span className="text-muted-foreground">→</span>}
        </li>
      ))}
    </ol>
  );
}
