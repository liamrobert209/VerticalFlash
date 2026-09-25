import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { ScanHistoryProvider } from "@/app/context/scan-history";
import { BrandProvider } from "@/app/context/brand";
import { ActiveProductProvider } from "@/app/context/active-product";
import { HistorySidebar } from "@/components/nav/HistorySidebar";
import { MediaPlaybackGuard } from "@/components/ui/MediaPlaybackGuard";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { SystemNoticesToaster } from "@/components/ui/SystemNoticesToaster";
import { getPublicBrand, getPublicProductLines } from "@/lib/config";
import { getActiveProductLineIdFromCookieStore } from "@/lib/active-product";
import "./globals.css";

// brand.config.json is read at request time, not baked in at build time
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

// Stand-in for the brand guideline's headline face (Quincy CF, a soft
// humanist serif licensed via MyFonts) — Fraunces is the closest free
// equivalent available through next/font. Swap this out once the licensed
// Quincy CF files/kit are available.
const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "VerticalFlash",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const brand = getPublicBrand();
  const productLineOptions = getPublicProductLines();
  const cookieStore = await cookies();
  const activeProductLineId = getActiveProductLineIdFromCookieStore(cookieStore);
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-full">
        <MediaPlaybackGuard />
        <SystemNoticesToaster />
        <ConfirmProvider>
          <BrandProvider value={brand}>
            <ActiveProductProvider active={activeProductLineId} options={productLineOptions}>
              <ScanHistoryProvider>
                <HistorySidebar />
                <main className="flex-1 min-w-0 pt-16 md:pt-0">{children}</main>
              </ScanHistoryProvider>
            </ActiveProductProvider>
          </BrandProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}
