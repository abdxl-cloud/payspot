import type { Metadata } from "next";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${headingFont.variable} antialiased`}>{children}</body>
    </html>
  );
}
