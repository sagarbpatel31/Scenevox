import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SceneVox — Direct every line",
  description: "A streaming voice studio for writers and creative teams.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
