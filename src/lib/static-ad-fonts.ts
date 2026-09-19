import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "path";

// Real, redistributable (Google Fonts, OFL-licensed — see assets/fonts/
// LICENSE.txt) stand-ins for the brand guideline's actual typefaces, which
// can't be bundled: Quincy CF is a paid MyFonts license, Filson Pro is an
// Adobe Fonts subscription font. Registered once per process so
// @napi-rs/canvas actually has these families available — previously the
// compositor requested "Arial Black"/"Helvetica Neue", which don't exist
// on the Linux container this renders on, silently falling back to a
// generic system font (confirmed the hard way: that's what produced the
// blocky/monospace-looking text in early static ads).

export const HEADLINE_FONT_FAMILY = "Bitter";
export const BODY_FONT_FAMILY = "Manrope";

let registered = false;

export function ensureStaticAdFontsRegistered(): void {
  if (registered) return;
  registered = true;
  const dir = join(process.cwd(), "assets", "fonts");
  GlobalFonts.registerFromPath(join(dir, "Bitter-Bold.ttf"), HEADLINE_FONT_FAMILY);
  GlobalFonts.registerFromPath(join(dir, "Manrope-Regular.ttf"), BODY_FONT_FAMILY);
  GlobalFonts.registerFromPath(join(dir, "Manrope-Bold.ttf"), BODY_FONT_FAMILY);
}
