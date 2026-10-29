/** "Step n of 2" over the two setup screens: Profile, then Local AI. */
const SETUP_STEPS = ["Profile", "Local AI"] as const;

export function SetupStepBar({ step }: { step: 1 | 2 }) {
  return (
    <p
      data-testid="setup-step"
      className="mb-4 text-center text-sm font-medium text-text-light-sub dark:text-text-dark-sub"
    >
      Step {step} of {SETUP_STEPS.length}: {SETUP_STEPS[step - 1]}
    </p>
  );
}
