// Length of "The English Company Small Batch Smokey Virgin 46% 700ml" — used as
// the longest product name we want to show inline. Anything longer is cut and
// the full name is shown in a tooltip on hover.
export const MAX_PRODUCT_NAME_LENGTH = 55;

export function truncateName(name, max = MAX_PRODUCT_NAME_LENGTH) {
  const value = name == null ? "" : String(name);
  if (value.length <= max) {
    return { display: value, truncated: false };
  }
  return { display: value.slice(0, max).trimEnd() + "…", truncated: true };
}
