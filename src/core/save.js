// Progresso salvo no navegador: estrelas de cada fase. Se o navegador nao deixar salvar, o jogo continua sem.
const KEY = 'magic-forest.progresso';

export function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    return { stars: { ...(p?.stars ?? {}) } };
  } catch {
    return { stars: {} };
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // modo anonimo ou armazenamento bloqueado
  }
}
