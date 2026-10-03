/**
 * Helper utility to format text strings to UPPERCASE for user-entered fields.
 * Handles null, undefined, and non-string inputs safely.
 * Preserves numbers, spaces, punctuation, and special characters.
 */
export const toUpperCaseText = (value: any): any => {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  return value.toUpperCase();
};
