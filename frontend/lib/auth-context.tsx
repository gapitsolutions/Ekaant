"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { registerAuthFailureHandler } from "./api-client";
import { getSession, login as apiLogin, logout as apiLogout } from "./hms-api";
import type { User, UserRole } from "./types";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  accessToken: string | null;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string; user?: User }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapBackendRole(role: string): UserRole {
  if (role === "admin") return "admin";
  if (role === "reception") return "reception";
  if (role === "receptionist") return "reception";
  return "reception";
}

function mapBackendUser(user: {
  id: string;
  email: string;
  full_name: string;
  role: string;
}): User {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: mapBackendRole(user.role),
    is_active: true,
    created_at: new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    registerAuthFailureHandler(() => {
      setUser(null);
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/login"
      ) {
        window.location.href = "/login";
      }
    });

    return () => {
      registerAuthFailureHandler(null);
    };
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    let cancelled = false;

    const bootstrapSession = async () => {
      try {
        const result = await getSession();
        if (!cancelled) {
          setUser(mapBackendUser(result.user));
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [isMounted]);

  const login = async (email: string, password: string) => {
    try {
      const result = await apiLogin(email, password);
      const mappedUser = mapBackendUser(result.user);
      setUser(mappedUser);
      return { success: true, user: mappedUser };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch {
      // Clearing local in-memory auth state is sufficient for the client redirect.
    } finally {
      setUser(null);
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  };

  if (!isMounted) {
    return null;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        accessToken: user ? "__cookie_session__" : null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Helper to check if user has required role
export function hasRole(user: User | null, allowedRoles: UserRole[]): boolean {
  if (!user) return false;
  return allowedRoles.includes(user.role);
}

// Role-based route mapping
export const roleRoutes: Partial<Record<UserRole, string>> = {
  admin: "/admin",
  reception: "/reception",
};
