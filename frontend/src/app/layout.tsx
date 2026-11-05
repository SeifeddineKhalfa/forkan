import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { IBM_Plex_Sans_Arabic, Reem_Kufi } from "next/font/google";
import messages from "../../messages/ar.json";
import { Providers } from "@/components/providers";
import { LOCALE, TIME_ZONE } from "@/i18n/request";
import "./globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-sans",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** Geometric Kufi for titles; body text stays in Plex for legibility. */
const reemKufi = Reem_Kufi({
  variable: "--font-heading",
  subsets: ["arabic", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: messages.app.name, template: `%s · ${messages.app.shortName}` },
  description: messages.public.heroBody,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1f4a48" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1d1f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes sets the theme class before React hydrates.
    <html lang={LOCALE} dir="rtl" className={`${plexArabic.variable} ${reemKufi.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-background font-sans text-foreground">
        <NextIntlClientProvider locale={LOCALE} timeZone={TIME_ZONE} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
