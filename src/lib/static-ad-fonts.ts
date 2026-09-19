import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "path";

// Real, redistributable (Google Fonts, OFL-licensed — see assets/fonts/
// LICENSE.txt) stand-ins for the brand guideline's actual typefaces.
// Quincy CF and Filson Pro are both confirmed no longer purchasable
// (Quincy CF's MyFonts listing literally says "no longer available for
// purchase"; Filson Pro was reported the same on Adobe Fonts) — these are
// deliberate close substitutes, not placeholders for a future real
// license. Fraunces was picked specifically because it's the free font
// most commonly used as a substitute for exactly Quincy CF's category
// (a soft, rounded-terminal display serif) — a closer match than Bitter's
// stiffer, more traditional slab-serif character, which is what it
// replaced. Registered once per process so @napi-rs/canvas actually has
// these families available — previously the compositor requested "Arial
// Black"/"Helvetica Neue", which don't exist on the Linux container this
// renders on, silently falling back to a generic system font.

export const HEADLINE_FONT_FAMILY = "Fraunces";
export const BODY_FONT_FAMILY = "Manrope";

let registered = false;

export function ensureStaticAdFontsRegistered(): void {
  if (registered) return;
  registered = true;
  const dir = join(process.cwd(), "assets", "fonts");
  GlobalFonts.registerFromPath(join(dir, "Fraunces-Black.ttf"), HEADLINE_FONT_FAMILY);
  GlobalFonts.registerFromPath(join(dir, "Manrope-Regular.ttf"), BODY_FONT_FAMILY);
  GlobalFonts.registerFromPath(join(dir, "Manrope-Bold.ttf"), BODY_FONT_FAMILY);
}
