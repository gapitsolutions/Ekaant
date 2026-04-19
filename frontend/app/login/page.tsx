"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth, roleRoutes } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Hospital } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const result = await login(email, password);

    if (result.success && result.user) {
      const role = result.user.role || "reception";
      window.location.href =
        roleRoutes[role as keyof typeof roleRoutes] || "/reception";
    } else {
      setError(result.error || "Login failed");
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary shadow-lg ring-4 ring-primary/20 transition-transform hover:scale-105">
            <Hospital className="h-10 w-10 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Help Nasha Mukti
            </h1>
            <p className="text-lg text-primary font-medium">
              Hospital Samana
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Patient Management System
            </p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="shadow-xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">Welcome Back</CardTitle>
            <CardDescription>
              Sign in to access the management system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11"
                  required
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold shadow-md"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="flex flex-col items-center gap-4 pt-6 border-t border-primary/10">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 font-bold">
            Developed & Managed By
          </p>
          <div className="group relative cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95">
            <div className="absolute -inset-2 bg-gradient-to-r from-primary/20 to-accent/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative h-20 w-52 overflow-hidden rounded-lg bg-white p-3 shadow-lg border border-white/40 dark:border-white/10 flex items-center justify-center">
              <Image
                src="/Logo_WBG.png"
                alt="GAP IT SOLUTIONS"
                fill
                className="object-contain transition-transform duration-500 group-hover:scale-110"
                priority
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/50 font-medium tracking-tight">
            Next-Gen Healthcare Management • v1.0.4
          </p>
        </div>
      </div>
    </div>
  );
}
