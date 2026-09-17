import type { CategorySpend } from "./adnova-schema";
import type { ProductLine } from "./product-lines";

// Adnova's product_category values don't map 1:1 onto our 8 product
// lines — "Generic"/"Ocuglow"/"Ocubulb"/"Oculamp"/"MagSafe Case" are real
// SKUs with no product-line equivalent at all, so this is a small explicit
// mapping rather than a guessed automatic one. "MacBook" and "Laptop/
// Monitor" are ambiguous (screen protector vs. privacy filter) — mapped to
// the screen-protector variant as the best guess, easy to adjust here.
export const PRODUCT_LINE_TO_ADNOVA_CATEGORY: Record<string, string> = {
  anti_blue_light_glasses: "Glasses",
  phone_screen_protector: "iPhone",
  ipad_screen_protector: "iPad",
  macbook_screen_protector: "MacBook",
  monitor_screen_protector: "Laptop/Monitor",
};

// Any of our product lines with zero mapped Adnova spend — either no
// mapping exists at all (macbook_privacy_filter, monitor_privacy_filter,
// eye_health_supplements) or the mapped category has no spend rows.
export function productLinesWithoutAdSpend(
  productLines: ProductLine[],
  categorySpend: CategorySpend[]
): ProductLine[] {
  const spendByCategory = new Map(categorySpend.map((c) => [c.productCategory, c.totalSpend]));
  return productLines.filter((p) => {
    const category = PRODUCT_LINE_TO_ADNOVA_CATEGORY[p.id];
    if (!category) return true;
    const spend = spendByCategory.get(category) ?? 0;
    return spend <= 0;
  });
}
