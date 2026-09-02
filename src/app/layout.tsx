import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spotify Popularity Lab",
  description: "Análise mobile-first de potencial de popularidade por gênero e faixa.",
};

export const viewport: Viewport = {
  themeColor: "#0e0c0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
