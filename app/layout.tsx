import type { Metadata } from "next";
import { Lato } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/query-provider";

// Lato matches the InsectID typography. We load 300/400/700/900 so headings
// can use 700 while body uses 400 (light 300 available for the eyebrow tag).
const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  display: "swap",
  variable: "--font-lato",
});

export const metadata: Metadata = {
  title: "Biodiversity Dashboard",
  description: "iNaturalist + GBIF occurrence dashboard for a configured AOI and taxon.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${lato.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans text-bark-600">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
