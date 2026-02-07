import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vince Stack - Sell Wi-Fi Vouchers Effortlessly",
  description:
    "Sell Wi-Fi vouchers at your venue with secure Paystack payments and instant SMS delivery. Simple, affordable, and fully customizable.",
  keywords: ["WiFi vouchers", "Paystack", "wireless access", "SMS delivery"],
  openGraph: {
    title: "Vince Stack - Sell Wi-Fi Vouchers Effortlessly",
    description:
      "Sell Wi-Fi vouchers at your venue with secure Paystack payments and instant SMS delivery.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${outfit.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
