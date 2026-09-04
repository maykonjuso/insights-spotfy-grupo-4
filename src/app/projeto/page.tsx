import type { Metadata } from "next";
import { PaginaProjeto } from "@/components/projeto/PaginaProjeto";

export const metadata: Metadata = {
  title: "Como o Popularity Lab foi feito",
  description:
    "O processo por trás do app: a análise das 89.740 faixas, o modelo bayesiano por estilo e a engenharia que roda a leitura de áudio dentro do navegador.",
};

export default function ProjetoPage() {
  return <PaginaProjeto />;
}
