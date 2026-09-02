import Link from 'next/link';

export default function DiagnosePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <h1>Diagnóstico</h1>
      <p>
        UI completa de diagnóstico será implementada na próxima sprint. Por enquanto, use a
        API diretamente:
      </p>
      <pre
        style={{
          background: '#f4f4f4',
          padding: '1rem',
          borderRadius: 4,
          overflowX: 'auto',
        }}
      >{`curl -X POST http://localhost:3000/api/diagnose \\
  -H 'Content-Type: application/json' \\
  -d '{
    "track_features": {
      "danceability": 0.7, "energy": 0.6, "loudness": -5.0,
      "speechiness": 0.05, "acousticness": 0.2, "instrumentalness": 0.0,
      "liveness": 0.1, "valence": 0.6, "tempo": 120.0,
      "explicit": 0, "mode_bin": 1
    },
    "genero": "pop"
  }'`}</pre>
      <p>
        <Link href="/">Voltar</Link>
      </p>
    </main>
  );
}