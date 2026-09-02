import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <h1>Spotify Diagnóstico</h1>
      <p>
        API de diagnóstico de popularidade musical usando um modelo Bayesiano (k=11) treinado
        em Python. Recebe features de áudio + gênero e retorna score 0-100, intervalo de
        credibilidade e explicação em PT-BR via LLM.
      </p>
      <p>
        <Link href="/diagnose">Ir para Diagnóstico</Link>
      </p>
      <hr style={{ margin: '2rem 0' }} />
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>POST /api/diagnose</code> — calcula score e explicação
        </li>
        <li>
          <code>GET /api/generos</code> — lista gêneros válidos
        </li>
      </ul>
    </main>
  );
}