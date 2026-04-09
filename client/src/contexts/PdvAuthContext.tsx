import React, { createContext, useContext } from "react";
import { trpc } from "@/lib/trpc";

interface PdvSeller {
  sellerId: number;
  name: string;
  username: string;
  role: "seller" | "admin";
}

interface PdvAuthContextType {
  seller: PdvSeller | null;
  isLoading: boolean;
  isAdmin: boolean;
  refetch: () => Promise<any>;
}

const PdvAuthContext = createContext<PdvAuthContextType>({
  seller: null,
  isLoading: true,
  isAdmin: false,
  refetch: () => Promise.resolve(),
});

export function PdvAuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, refetch } = trpc.pdvAuth.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const seller = data as PdvSeller | null;

  return (
    <PdvAuthContext.Provider
      value={{
        seller,
        isLoading,
        isAdmin: seller?.role === "admin",
        refetch,
      }}
    >
      {children}
    </PdvAuthContext.Provider>
  );
}

export function usePdvAuth() {
  return useContext(PdvAuthContext);
}
