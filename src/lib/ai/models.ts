// Single place every feature reads its model from, so switching a feature
// between cheap/smart tiers — or upgrading a tier's model entirely — is a
// one-line change here rather than an edit in each calling file.
export const AI_MODELS = {
  cheap: "claude-haiku-4-5",
  smart: "claude-sonnet-5",
} as const;

export type AIModelTier = keyof typeof AI_MODELS;
