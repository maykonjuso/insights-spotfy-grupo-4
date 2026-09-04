"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SECOES } from "@/lib/projeto-conteudo";
import { descricaoDoMotor, motorAtual, motorDoServidor, type Motor } from "@/lib/transmissao";
import { Retrato, useApresentacao } from "./Apresentacao";

const LADO_DA_FOTO = 256;

// A foto vira um data URL pequeno antes de entrar no canal: o que o
// apresentador escolhe costuma ter alguns megabytes, e mensagem de broadcast
// tem limite de tamanho. 256px de lado dá de sobra para um retrato de 40px.
async function reduzirFoto(arquivo: File): Promise<string> {
  const bitmap = await createImageBitmap(arquivo);
  const lado = Math.min(bitmap.width, bitmap.height);
  const tela = document.createElement("canvas");
  tela.width = LADO_DA_FOTO;
  tela.height = LADO_DA_FOTO;

  const contexto = tela.getContext("2d");
  if (!contexto) throw new Error("sem canvas");

  contexto.drawImage(
    bitmap,
    (bitmap.width - lado) / 2,
    (bitmap.height - lado) / 2,
    lado,
    lado,
    0,
    0,
    LADO_DA_FOTO,
    LADO_DA_FOTO,
  );
  bitmap.close();

  return tela.toDataURL("image/jpeg", 0.72);
}

export function PainelAdmin() {
  const { iniciar, encerrar, transmitindo, transmitir, apresentador } = useApresentacao();
  const inputFoto = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [foto, setFoto] = useState<string | undefined>();

  // ao voltar para o /admin com a apresentação já no ar, os campos reaparecem
  useEffect(() => {
    if (!apresentador) return;
    setNome((atual) => atual || apresentador.nome);
    setFoto((atual) => atual || apresentador.foto);
  }, [apresentador]);
  const [erro, setErro] = useState<string | null>(null);
  const [motor, setMotor] = useState<Motor>("local");
  const [servidor, setServidor] = useState<"upstash" | "memoria">("memoria");
  const [alvo, setAlvo] = useState<"app" | "landing">("landing");
  const [secao, setSecao] = useState(SECOES[0].id);

  useEffect(() => {
    setMotor(motorAtual());
    void motorDoServidor().then(setServidor);
  }, []);

  const publicar = useCallback(
    (proximaSecao = secao, proximoAlvo = alvo) => {
      if (!transmitindo) return;
      transmitir({
        rota: proximoAlvo === "landing" ? "/projeto" : "/",
        secao: proximoAlvo === "landing" ? proximaSecao : undefined,
        rolagem: 0,
      });
    },
    [transmitindo, transmitir, nome, foto, secao, alvo],
  );

  // Publica ao entrar no ar e a cada mudança daqui. A repetição periódica, que
  // é o que faz o convite chegar a quem abre o app no meio da apresentação,
  // mora no provedor: aqui ela morria assim que esta tela desmontava.
  useEffect(() => {
    if (!transmitindo) return;
    publicar();
  }, [transmitindo, publicar]);

  const indice = SECOES.findIndex((s) => s.id === secao);

  function andar(passo: number) {
    const proxima = SECOES[Math.min(SECOES.length - 1, Math.max(0, indice + passo))];
    setSecao(proxima.id);
    publicar(proxima.id);
  }

  if (!transmitindo) {
    return (
      <main className="admin">
        <div className="admin-cartao">
          <p className="secao-etiqueta">Modo apresentação</p>
          <h1>Quem está apresentando?</h1>
          <p className="admin-linha">
            Todo mundo com o app aberto recebe um convite para acompanhar a sua tela. Depois de cinco
            segundos, o convite é aceito sozinho, e qualquer um pode sair quando quiser.
          </p>

          <label className="admin-campo" htmlFor="admin-nome">
            <span>Seu nome</span>
            <input
              id="admin-nome"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Como você quer aparecer"
              autoComplete="name"
              maxLength={40}
            />
          </label>

          <div className="admin-foto">
            {nome.trim() ? <Retrato apresentador={{ id: "admin", nome, foto }} /> : <span className="retrato is-vazio" />}
            <button type="button" className="btn-secundario" onClick={() => inputFoto.current?.click()}>
              {foto ? "Trocar foto" : "Escolher foto"}
            </button>
            {foto ? (
              <button type="button" className="admin-tirar" onClick={() => setFoto(undefined)}>
                Remover
              </button>
            ) : null}
            <input
              ref={inputFoto}
              type="file"
              className="input-escondido"
              accept="image/*"
              aria-label="Escolher sua foto"
              onChange={async (evento) => {
                const arquivo = evento.target.files?.[0];
                evento.target.value = "";
                if (!arquivo) return;
                try {
                  setFoto(await reduzirFoto(arquivo));
                  setErro(null);
                } catch {
                  setErro("Não consegui ler essa imagem. Tente outra.");
                }
              }}
            />
          </div>

          {erro ? <p className="aviso is-erro">{erro}</p> : null}

          <div className="admin-alvos" role="group" aria-label="O que apresentar">
            <button
              type="button"
              className={`chip ${alvo === "landing" ? "is-ativo" : ""}`}
              onClick={() => setAlvo("landing")}
            >
              Página do projeto
            </button>
            <button
              type="button"
              className={`chip ${alvo === "app" ? "is-ativo" : ""}`}
              onClick={() => setAlvo("app")}
            >
              O app
            </button>
          </div>

          <p className={`admin-motor is-${motor === "sse" && servidor === "upstash" ? "supabase" : motor}`}>
            {descricaoDoMotor(motor, servidor)}
          </p>

          <button
            type="button"
            className="btn-principal"
            disabled={nome.trim().length < 2}
            onClick={() => {
              iniciar({ id: "admin", nome: nome.trim(), foto });
              // já abre o que vai ser apresentado: antes era preciso trocar de
              // página na mão depois de começar
              router.push(alvo === "landing" ? "/projeto" : "/");
            }}
          >
            Começar apresentação
          </button>

          <Link href="/" className="admin-voltar">
            Voltar para o app
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="admin is-no-ar">
      <div className="admin-cartao">
        <div className="admin-ao-vivo">
          <Retrato apresentador={{ id: "admin", nome, foto }} pequeno />
          <span>
            <b>No ar</b> como {nome}
          </span>
          <span className="admin-pulso" aria-hidden="true" />
        </div>

        <div className="admin-alvos" role="group" aria-label="O que transmitir">
          <button
            type="button"
            className={`chip ${alvo === "landing" ? "is-ativo" : ""}`}
            onClick={() => {
              setAlvo("landing");
              publicar(secao, "landing");
            }}
          >
            Página do projeto
          </button>
          <button
            type="button"
            className={`chip ${alvo === "app" ? "is-ativo" : ""}`}
            onClick={() => {
              setAlvo("app");
              publicar(secao, "app");
            }}
          >
            O app
          </button>
        </div>

        {alvo === "landing" ? (
          <div className="admin-slides">
            <div className="admin-passo">
              <button type="button" onClick={() => andar(-1)} disabled={indice <= 0} aria-label="Seção anterior">
                ‹
              </button>
              <span>
                <b>{String(indice + 1).padStart(2, "0")}</b>
                <i>/{String(SECOES.length).padStart(2, "0")}</i>
              </span>
              <button
                type="button"
                onClick={() => andar(1)}
                disabled={indice >= SECOES.length - 1}
                aria-label="Próxima seção"
              >
                ›
              </button>
            </div>

            <strong className="admin-slide-titulo">{SECOES[indice]?.titulo}</strong>

            <ul className="admin-lista">
              {SECOES.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={s.id === secao ? "is-atual" : ""}
                    onClick={() => {
                      setSecao(s.id);
                      publicar(s.id);
                    }}
                  >
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    {s.etiqueta}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="admin-linha">
            Abra o app em outra aba e navegue normalmente. Quem está acompanhando vê a sua tela, o seu
            ponteiro e os seus cliques.
          </p>
        )}

        <div className="admin-rodape">
          <Link href={alvo === "landing" ? "/projeto" : "/"} className="btn-secundario">
            Abrir o que estou apresentando
          </Link>
          <button type="button" className="admin-parar" onClick={encerrar}>
            Encerrar apresentação
          </button>
        </div>
      </div>
    </main>
  );
}
