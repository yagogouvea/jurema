import { useEffect, useRef, useState } from "react";

/**
 * Estado da validação de CEP via ViaCEP (gratuito, sem chave).
 *  - idle:    nada digitado / menos de 8 dígitos.
 *  - loading: requisição em andamento.
 *  - valid:   CEP existe e veio do ViaCEP (com endereço).
 *  - invalid: CEP não existe (ou erro de rede após retry).
 */
export type CepLookupStatus = "idle" | "loading" | "valid" | "invalid";

export interface CepLookupResult {
  status: CepLookupStatus;
  /** CEP formatado 99999-999 retornado pelo ViaCEP. */
  cepFormatado?: string;
  /** Endereço resumido para exibição visual (logradouro, bairro - cidade/UF). */
  enderecoResumo?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  /** Mensagem de erro amigável para exibir em vermelho. */
  errorMessage?: string;
}

const cache = new Map<string, CepLookupResult>();

function onlyDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

/**
 * Consulta ViaCEP com debounce assim que o CEP atinge 8 dígitos.
 * Cancela requisições obsoletas via AbortController para evitar race conditions
 * quando o usuário continua digitando rapidamente.
 */
export function useCepLookup(cepInput: string, debounceMs = 350): CepLookupResult {
  const [result, setResult] = useState<CepLookupResult>({ status: "idle" });
  const lastReqId = useRef(0);

  useEffect(() => {
    const digits = onlyDigits(cepInput);
    if (digits.length === 0) {
      setResult({ status: "idle" });
      return;
    }
    if (digits.length < 8) {
      setResult({ status: "idle" });
      return;
    }

    const cached = cache.get(digits);
    if (cached) {
      setResult(cached);
      return;
    }

    const reqId = ++lastReqId.current;
    const ctrl = new AbortController();
    setResult({ status: "loading" });

    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
          signal: ctrl.signal,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as {
          erro?: boolean;
          cep?: string;
          logradouro?: string;
          bairro?: string;
          localidade?: string;
          uf?: string;
        };

        let next: CepLookupResult;
        if (data.erro || !data.cep) {
          next = {
            status: "invalid",
            errorMessage: "CEP não encontrado nos Correios",
          };
        } else {
          const partes = [data.logradouro, data.bairro].filter(Boolean).join(", ");
          const cidadeUf = [data.localidade, data.uf].filter(Boolean).join("/");
          next = {
            status: "valid",
            cepFormatado: data.cep,
            logradouro: data.logradouro,
            bairro: data.bairro,
            localidade: data.localidade,
            uf: data.uf,
            enderecoResumo: [partes, cidadeUf].filter(Boolean).join(" - "),
          };
        }

        cache.set(digits, next);
        if (reqId === lastReqId.current) setResult(next);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        if (reqId === lastReqId.current) {
          setResult({
            status: "invalid",
            errorMessage: "Não foi possível validar o CEP. Verifique a conexão.",
          });
        }
      }
    }, debounceMs);

    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [cepInput, debounceMs]);

  return result;
}
