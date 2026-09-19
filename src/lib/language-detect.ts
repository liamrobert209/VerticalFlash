import { franc } from "franc";

// Franc's own docs suggest a ~10 char minimum, but empirically that's far
// too low for real ad copy: short, informal, URL/emoji-heavy English text
// like "Shop here ➡️ barnerbrand.com" (a real synced ad) gets confidently
// misclassified as Dutch/Scots/French by the n-gram model — there just
// isn't enough signal in a few words. Verified 90+ char samples reliably
// resolve to "eng" for real English marketing copy while still correctly
// distinguishing Spanish/German at similar lengths, so 60 chars is the
// floor below which we don't trust franc's verdict at all and default to
// treating the text as English (short non-English ads may slip through —
// an accepted tradeoff, per this app's "default to inclusion when
// uncertain" policy, since falsely dropping a real English ad is worse).
const MIN_TEXT_LENGTH = 60;

// Returns the ISO 639-3 code (e.g. "tha") only when franc is confident the
// text is a language OTHER than English — null for English, "und"
// (undetermined, usually short/ambiguous text), or anything under
// MIN_TEXT_LENGTH. Used both to decide whether to skip an ad (see
// isLikelyNonEnglish below) and to tag which language a skipped ad was
// actually in (see weekly-ads-sync.ts's recordFlaggedAdLanguage call).
export function detectAdLanguage(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < MIN_TEXT_LENGTH) return null;
  const code = franc(trimmed, { minLength: MIN_TEXT_LENGTH });
  return code !== "und" && code !== "eng" ? code : null;
}

export function isLikelyNonEnglish(text: string | null | undefined): boolean {
  return detectAdLanguage(text) !== null;
}
