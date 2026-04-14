import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

export interface AuthUser {
  id: string | number;
  email: string;
  displayName?: string;
  role?: string;
}

export function useAuth() {
  const query = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data,
    isOwner: query.data?.role === "owner",
    logout: async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      queryClient.clear();
      window.location.href = "/#/login";
    },
  };
}
