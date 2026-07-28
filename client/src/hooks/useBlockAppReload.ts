import { useEffect } from "react";
import { acquireAppBusy } from "@/lib/appUpdate";

/**
 * Impede o auto-reload de nova versão enquanto `active` for true
 * (ex.: carrinho com itens, checkout aberto).
 */
export function useBlockAppReload(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const release = acquireAppBusy();
    return release;
  }, [active]);
}
