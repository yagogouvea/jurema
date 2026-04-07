import { createContext, useContext } from "react";
import { trpc } from "@/lib/trpc";

interface AdminUser {
  id: unknown;
  username: unknown;
  name: unknown;
}

interface AdminAuthContextType {
  admin: AdminUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
  admin: null,
  isLoading: true,
  isAuthenticated: false,
});

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const { data: admin, isLoading } = trpc.adminAuth.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <AdminAuthContext.Provider value={{
      admin: admin ?? null,
      isLoading,
      isAuthenticated: !!admin,
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
