"use client";

type SpotifyEmbedProps = {
  trackId: string;
  trackName: string;
};

// O player oficial toca a faixa inteira para quem esta logado no Spotify e cai
// para a previa de 30s nos demais casos -- e o unico caminho que nao depende do
// preview_url, que a API deixou de preencher para credenciais novas.
export function SpotifyEmbed({ trackId, trackName }: SpotifyEmbedProps) {
  return (
    <div className="spotify-embed">
      <iframe
        key={trackId}
        title={`Player do Spotify para ${trackName}`}
        src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`}
        width="100%"
        height="152"
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
