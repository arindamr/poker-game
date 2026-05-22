import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker Game",
  description: "Multiplayer Texas Hold'em poker with real-time play.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
