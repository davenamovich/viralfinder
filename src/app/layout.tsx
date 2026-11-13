import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "P&R Thought Engine — Trend Scout",
  description:
    "Find what the world is already talking about. Turn it into something worth watching. The Plunder & Riffle Thought Engine Trend Scout.",
  keywords: [
    "Plunder & Riffle",
    "P&R",
    "Trend Scout",
    "Thought Engine",
    "Google Trends",
    "Content Strategy",
  ],
  authors: [{ name: "Plunder & Riffle" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "P&R Thought Engine — Trend Scout",
    description:
      "Find the signal. Build the version worth sharing.",
    siteName: "Plunder & Riffle",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "P&R Thought Engine — Trend Scout",
    description: "Find the signal. Build the version worth sharing.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-center" richColors theme="dark" />
      </body>
    </html>
  );
}
