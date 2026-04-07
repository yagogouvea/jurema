import React, { createContext, useContext, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

type Customer = {
  id: number;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  addressZip?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
};

type CustomerAuthContextType = {
  customer: Customer | null;
  loading: boolean;
  isAuthenticated: boolean;
  refetch: () => void;
};

const CustomerAuthContext = createContext<CustomerAuthContextType>({
  customer: null,
  loading: true,
  isAuthenticated: false,
  refetch: () => {},
});

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, refetch } = trpc.customerAuth.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <CustomerAuthContext.Provider
      value={{
        customer: data ?? null,
        loading: isLoading,
        isAuthenticated: !!data,
        refetch,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  return useContext(CustomerAuthContext);
}
