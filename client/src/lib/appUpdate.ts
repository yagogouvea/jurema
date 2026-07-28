/**
 * Controle de "trabalho em andamento" para o auto-update do app.
 *
 * O carrinho do PDV vive só em memória: recarregar a página no meio de uma
 * venda perderia os itens. Enquanto houver algum bloqueio ativo, o watcher
 * mostra um aviso tocável em vez de recarregar sozinho.
 */
let busyCount = 0;

export function isAppBusy(): boolean {
  return busyCount > 0;
}

/** Registra um bloqueio; devolve a função que o libera. */
export function acquireAppBusy(): () => void {
  busyCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    busyCount = Math.max(0, busyCount - 1);
  };
}
