import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
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
  refetch: () => void;
}

const PdvAuthContext = createContext<PdvAuthContextType>({
  seller: null,
  isLoading: true,
  isAdmin: false,
  refetch: () => {},
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
