// Single place every feature reads its model from, so switching a feature
// between cheap/smart tiers — or upgrading a tier's model entirely — is a
// one-line change here rather than an edit in each calling file.
export const AI_MODELS = {
  cheap: "claude-haiku-4-5",
  smart: "claude-sonnet-5",
} as const;

export type AIModelTier = keyof typeof AI_MODELS;

/**
 * For a call where a person is waiting and the task is choosing or writing, not working something out: the model may
 * think a little, but is told to keep it short. Left at its default it can think for 15 seconds or more, and that
 * thinking is counted against the reply's length, so a long think can cut the reply itself off. Measured on plan
 * generation: about 20 seconds by default, and about 10 with this, with a valid plan every time.
 */
export const QUICK_THINKING = {
  thinking: { type: "adaptive" },
  output_config: { effort: "low" },
} as const;
