import type { Metadata } from "next";
import { Poppins, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const poppins = Poppins({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "PaySpot - WiFi Payment Platform for Your Venue",
  description:
    "The fastest way to monetize WiFi at your venue. Paystack payments, SMS codes, instant setup. Turn WiFi into revenue.",
  keywords: ["WiFi payments", "Paystack", "WiFi monetization", "voucher system", "wireless access"],
  openGraph: {
    title: "PaySpot - WiFi Payment Platform",
    description:
      "Monetize WiFi at your venue with instant Paystack payments and SMS delivery.",
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
      <body className={`${spaceGrotesk.variable} ${poppins.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
