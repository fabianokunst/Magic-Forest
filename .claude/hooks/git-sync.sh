#!/usr/bin/env bash
# Mantém a pasta sincronizada com o GitHub (chamado pelos hooks do Claude Code).
#   git-sync.sh pull  -> traz o que mudou no GitHub (início da sessão)
#   git-sync.sh push  -> commita o que estiver pendente e envia (fim de cada resposta)
# Nunca bloqueia o Claude: qualquer problema vira só um aviso na tela.

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

warn() { printf '{"systemMessage": "git-sync: %s"}\n' "$1"; exit 0; }

# Não mexe no meio de um merge/rebase, nem fora de um branch.
for p in rebase-merge rebase-apply MERGE_HEAD; do
  [ -e "$(git rev-parse --git-path "$p")" ] && warn "merge/rebase em andamento, sincronização pulada (veja git status)"
done
branch=$(git symbolic-ref --short -q HEAD) || exit 0
remote="origin/$branch"

integrate() {
  git fetch -q origin || return 1
  git rev-parse -q --verify "$remote" >/dev/null || return 0
  git merge-base --is-ancestor "$remote" HEAD 2>/dev/null && return 0
  git rebase -q --autostash "$remote" || { git rebase --abort 2>/dev/null; return 2; }
}

case "$1" in
  pull)
    integrate
    case $? in
      1) warn "sem conexão com o GitHub, continuando com a cópia local" ;;
      2) warn "conflito ao trazer mudanças do GitHub; nada foi alterado, resolva com git pull" ;;
    esac
    ;;
  push)
    if [ -n "$(git status --porcelain)" ]; then
      git add -A && git commit -q -m "Sincronização automática ($(date '+%Y-%m-%d %H:%M'))" \
        || warn "não consegui criar o commit automático (veja git status)"
    fi
    git rev-parse -q --verify HEAD >/dev/null || exit 0
    [ "$(git rev-parse HEAD)" = "$(git rev-parse -q --verify "$remote")" ] && exit 0
    git push -q -u origin "$branch" 2>/dev/null && exit 0
    # O GitHub tem commits que não estão aqui: integra e tenta de novo.
    integrate && git push -q -u origin "$branch" && exit 0
    warn "push para o GitHub falhou; as mudanças estão salvas localmente (rode git status)"
    ;;
esac
exit 0
