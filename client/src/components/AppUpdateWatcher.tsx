import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { isAppBusy } from "@/lib/appUpdate";

const VERSION_URL = "/api/version";
const POLL_MS = 3 * 60 * 1000;
/** Só recarrega sozinho depois desse tempo sem toque/tecla na tela. */
const IDLE_MS = 45 * 1000;
const READY_CHECK_MS = 5 * 1000;
/** Evita ficar recarregando em loop se o navegador insistir no HTML antigo. */
const RETRY_KEY = "app_update_reloaded_for";

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch(VERSION_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data?.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

function isEditingSomeField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * Detecta deploy novo e atualiza o app sozinho.
 *
 * Sem isso, um celular que fica com a aba aberta por dias continua executando o
 * bundle antigo: a tela some com campos que o servidor já passou a exigir e a
 * pessoa trava em erros de validação que não tem como corrigir.
 */
export default function AppUpdateWatcher() {
  const loadedVersion = useRef<string | null>(null);
  const lastInteraction = useRef(Date.now());
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const check = useCallback(async () => {
    const version = await fetchVersion();
    if (!version) return;
    if (loadedVersion.current === null) {
      loadedVersion.current = version;
      return;
    }
    if (version !== loadedVersion.current) setUpdateAvailable(true);
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const markInteraction = () => {
      lastInteraction.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pointerdown", markInteraction, true);
    window.addEventListener("keydown", markInteraction, true);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pointerdown", markInteraction, true);
      window.removeEventListener("keydown", markInteraction, true);
    };
  }, [check]);

  const reloadNow = useCallback(() => {
    try {
      sessionStorage.setItem(RETRY_KEY, loadedVersion.current ?? "");
    } catch {
      /* modo privado pode bloquear o sessionStorage */
    }
    window.location.reload();
  }, []);

  // Atualiza sozinho quando ninguém está no meio de alguma coisa.
  useEffect(() => {
    if (!updateAvailable) return;
    let alreadyTried = false;
    try {
      alreadyTried = sessionStorage.getItem(RETRY_KEY) === (loadedVersion.current ?? "");
    } catch {
      /* ignora */
    }
    if (alreadyTried) return; // recarregar de novo não resolveria; deixa só o aviso na tela

    const timer = window.setInterval(() => {
      if (isAppBusy()) return;
      if (isEditingSomeField()) return;
      if (Date.now() - lastInteraction.current < IDLE_MS) return;
      window.clearInterval(timer);
      reloadNow();
    }, READY_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [updateAvailable, reloadNow]);

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex justify-center p-2">
      <button
        onClick={reloadNow}
        className="flex w-full max-w-md items-center gap-3 rounded-xl border border-green-500 bg-green-700 px-4 py-3 text-left text-white shadow-2xl transition-colors hover:bg-green-600"
      >
        <RefreshCw className="h-5 w-5 flex-shrink-0" />
        <span className="text-sm font-semibold leading-tight">
          Nova versão do sistema disponível
          <span className="mt-0.5 block text-xs font-normal text-green-100">
            Toque para atualizar agora (ou finalize a venda e o app atualiza sozinho).
          </span>
        </span>
      </button>
    </div>
  );
}
