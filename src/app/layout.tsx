import type { Metadata } from "next";
import { Bitter, Playfair_Display } from "next/font/google";
import "./globals.css";

const bodyFont = Bitter({
  variable: "--font-body",
  subsets: ["latin"],
});

const displayFont = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin"],
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
      <body className={`${bodyFont.variable} ${displayFont.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
