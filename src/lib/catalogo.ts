"use client";

// Cache de músicas por estilo, vivo enquanto a aba estiver aberta.
// A tela de abertura já busca o primeiro estilo enquanto a animação roda, então
// quem toca em "Procurar no Spotify" encontra a lista pronta, sem esqueleto.
export type Faixa = {
  id: string;
  name: string;
  popularity?: number;
  duration_ms: number;
  explicit: boolean;
  external_urls: { spotify: string };
  artists: { name: string }[];
  album: { name: string; release_date?: string; images: { url: string }[] };
};

export const ESTILOS = [
  "pop",
  "sertanejo",
  "funk",
  "mpb",
  "hip-hop",
  "rock",
  "k-pop",
  "pagode",
  "samba",
  "eletronica",
];

export const ESTILO_INICIAL = ESTILOS[0];

type Entrada =
  | { estado: "carregando"; promessa: Promise<Faixa[]> }
  | { estado: "pronto"; faixas: Faixa[] }
  | { estado: "erro"; mensagem: string };

const cache = new Map<string, Entrada>();

async function buscar(estilo: string): Promise<Faixa[]> {
  const resposta = await fetch(`/api/tracks?genre=${encodeURIComponent(estilo)}`);
  const dados = (await resposta.json()) as { tracks?: Faixa[]; error?: string };

  if (!resposta.ok) {
    throw new Error(
      dados.error?.includes("SPOTIFY")
        ? "A busca no Spotify precisa das credenciais no arquivo .env.local do servidor."
        : "Não consegui buscar músicas agora. Confira a conexão e tente de novo.",
    );
  }

  return dados.tracks ?? [];
}

/** Dispara a busca sem esperar. Chamar de novo com o mesmo estilo não repete. */
export function prefetch(estilo: string) {
  const atual = cache.get(estilo);
  if (atual && atual.estado !== "erro") return;

  const promessa = buscar(estilo)
    .then((faixas) => {
      cache.set(estilo, { estado: "pronto", faixas });
      return faixas;
    })
    .catch((falha: Error) => {
      cache.set(estilo, { estado: "erro", mensagem: falha.message });
      throw falha;
    });

  cache.set(estilo, { estado: "carregando", promessa });
}

/** O que já está em memória, para a tela pintar antes de qualquer espera. */
export function jaTemos(estilo: string) {
  const entrada = cache.get(estilo);
  return entrada?.estado === "pronto" ? entrada.faixas : null;
}

export async function carregar(estilo: string): Promise<Faixa[]> {
  const entrada = cache.get(estilo);

  if (entrada?.estado === "pronto") return entrada.faixas;
  if (entrada?.estado === "carregando") return entrada.promessa;

  prefetch(estilo);
  const nova = cache.get(estilo);
  if (nova?.estado === "carregando") return nova.promessa;
  return [];
}
