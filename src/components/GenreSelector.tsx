"use client";

import { useMemo, useState } from "react";

type GenreSelectorProps = {
  genres: string[];
  selectedGenre: string;
  onSelect: (genre: string) => void;
};

export function GenreSelector({ genres, selectedGenre, onSelect }: GenreSelectorProps) {
  const [query, setQuery] = useState("");

  const filteredGenres = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return genres;
    return genres.filter((genre) => genre.toLowerCase().includes(normalized));
  }, [genres, query]);

  function submitCustomGenre() {
    const value = query.trim().toLowerCase();
    if (value) onSelect(value);
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <p>Etapa 1</p>
        <h2>Gênero musical</h2>
      </div>

      <div className="search-box">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitCustomGenre();
          }}
          placeholder="Busque: pop, k-pop, rock..."
          aria-label="Buscar gênero musical"
        />
        <button type="button" onClick={submitCustomGenre}>
          Usar
        </button>
      </div>

      <div className="genre-grid" aria-label="Sugestões de gênero">
        {filteredGenres.slice(0, 18).map((genre) => (
          <button
            type="button"
            key={genre}
            className={genre === selectedGenre ? "is-active" : ""}
            onClick={() => onSelect(genre)}
          >
            {genre}
          </button>
        ))}
      </div>
    </section>
  );
}
