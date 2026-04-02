import type { Metadata, Viewport } from "next";
import { Exo_2, Manrope } from "next/font/google";
import "./globals.css";

const bodyFont = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const headingFont = Exo_2({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PaySpot | Wi-Fi Voucher Platform",
  description:
    "Sell Wi-Fi vouchers with Paystack and deliver access codes by SMS.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PaySpot",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a2e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${bodyFont.variable} ${headingFont.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
