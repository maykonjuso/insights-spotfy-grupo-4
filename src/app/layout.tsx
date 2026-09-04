import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Apresentacao } from "@/components/apresentacao/Apresentacao";
import "./globals.css";

// Em aparelho Apple a pilha do CSS pega a SF Pro do proprio sistema; a Inter
// entra como equivalente mais proximo no Android e no Windows. O next/font
// hospeda o arquivo junto com o app, entao nao ha requisicao a servidor de
// terceiro nem salto de layout quando a fonte carrega.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--fonte",
});

export const metadata: Metadata = {
  title: "Popularity Lab",
  description: "Descubra a nota de popularidade que a sua música tiraria.",
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  width: "device-width",
  initialScale: 1,
  // deixa a pagina desenhar sob o notch e a barra inferior; o padding com
  // env(safe-area-inset-*) no globals.css devolve o espaco onde importa
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <Apresentacao>{children}</Apresentacao>
      </body>
    </html>
  );
}
