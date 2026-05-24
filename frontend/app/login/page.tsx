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
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import type { ApiFieldErrors } from "@/lib/api-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setFieldErrors({});

    const result = await login(email, password);

    if (result.success && result.user) {
      const role = result.user.role || "reception";
      window.location.href =
        roleRoutes[role as keyof typeof roleRoutes] || "/reception";
    } else {
      setError(result.error || "Login failed");
      if (result.fields) setFieldErrors(result.fields);
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo and Hospital Name */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative h-24 w-24 overflow-hidden rounded-2xl bg-white shadow-lg p-2">
            <Image
              src="/logo.png"
              alt="Aggarwal Hospital Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Aggarwal Psychiatric
            </h1>
            <p className="text-lg text-primary font-medium">
              & De-Addiction Centre
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
                <FieldError message={fieldErrors.email?.[0]} />
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
                <FieldError message={fieldErrors.password?.[0]} />
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
        <p className="text-center text-xs text-muted-foreground">
          Secure healthcare management system
        </p>
      </div>
    </div>
  );
}
