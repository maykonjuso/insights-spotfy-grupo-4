import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Spotify Diagnóstico',
  description: 'Diagnóstico de popularidade musical via modelo Bayesiano',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}