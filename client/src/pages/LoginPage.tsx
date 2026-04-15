import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Github } from "lucide-react";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
    </svg>
  );
}

function OAuthButtons({ label }: { label: string }) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-card px-3 text-muted-foreground">or continue with</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full h-11 rounded-xl bg-[#24292e] hover:bg-[#2f363d] text-white border-[#444d56] hover:text-white"
        onClick={() => (window.location.href = "/api/auth/github")}
      >
        <Github className="w-4 h-4 mr-2" />
        {label} with GitHub
      </Button>

      <Button
        type="button"
        variant="outline"
        className="w-full h-11 rounded-xl bg-white hover:bg-gray-50 text-gray-800 border-gray-300"
        onClick={() => (window.location.href = "/api/auth/google")}
      >
        <span className="mr-2"><GoogleIcon /></span>
        {label} with Google
      </Button>
    </div>
  );
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"signin" | "signup">("signin");

  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInError, setSignInError] = useState("");
  const [signInLoading, setSignInLoading] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signUpError, setSignUpError] = useState("");
  const [signUpLoading, setSignUpLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) {
      const messages: Record<string, string> = {
        oauth_failed: "OAuth sign-in failed. Please try again.",
        oauth_cancelled: "OAuth sign-in was cancelled.",
        account_exists: "An account with this email already exists.",
        unauthorized: "Access denied. Please sign in.",
      };
      setSignInError(messages[error] ?? "Authentication error. Please try again.");
    }
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError("");
    setSignInLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signInEmail, password: signInPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSignInError(data.message ?? "Invalid email or password.");
        return;
      }
      window.location.href = "/#/";
    } catch {
      setSignInError("Network error. Please try again.");
    } finally {
      setSignInLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignUpError("");
    if (signUpPassword !== confirmPassword) { setSignUpError("Passwords do not match."); return; }
    if (signUpPassword.length < 6) { setSignUpError("Password must be at least 6 characters."); return; }

    setSignUpLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signUpEmail, password: signUpPassword, displayName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSignUpError(data.message ?? "Registration failed. Please try again.");
        return;
      }
      window.location.href = "/#/";
    } catch {
      setSignUpError("Network error. Please try again.");
    } finally {
      setSignUpLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">B</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome to Bunz</h1>
          <p className="text-[15px] text-muted-foreground mt-1.5">Build cool stuff. Ship faster.</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as "signin" | "signup");
              setSignInError("");
              setSignUpError("");
            }}
          >
            <TabsList className="w-full rounded-none border-b border-border bg-card h-12 p-0">
              <TabsTrigger
                value="signin"
                className="flex-1 rounded-none h-full data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none text-sm font-medium"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="flex-1 rounded-none h-full data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none text-sm font-medium"
              >
                Sign Up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="p-6 space-y-4 mt-0">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input id="signin-email" type="email" placeholder="you@example.com" autoComplete="email" className="h-11 rounded-xl" value={signInEmail} onChange={(e) => setSignInEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input id="signin-password" type="password" placeholder="••••••••" autoComplete="current-password" className="h-11 rounded-xl" value={signInPassword} onChange={(e) => setSignInPassword(e.target.value)} required />
                </div>
                {signInError && (
                  <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">{signInError}</p>
                )}
                <Button type="submit" className="w-full h-11 rounded-xl text-sm font-medium" disabled={signInLoading}>
                  {signInLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
              <OAuthButtons label="Sign in" />
            </TabsContent>

            <TabsContent value="signup" className="p-6 space-y-4 mt-0">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Display Name</Label>
                  <Input id="signup-name" type="text" placeholder="Your name" autoComplete="name" className="h-11 rounded-xl" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" type="email" placeholder="you@example.com" autoComplete="email" className="h-11 rounded-xl" value={signUpEmail} onChange={(e) => setSignUpEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input id="signup-password" type="password" placeholder="••••••••" autoComplete="new-password" className="h-11 rounded-xl" value={signUpPassword} onChange={(e) => setSignUpPassword(e.target.value)} required />
                  <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Confirm Password</Label>
                  <Input id="signup-confirm" type="password" placeholder="••••••••" autoComplete="new-password" className="h-11 rounded-xl" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                </div>
                {signUpError && (
                  <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">{signUpError}</p>
                )}
                <Button type="submit" className="w-full h-11 rounded-xl text-sm font-medium" disabled={signUpLoading}>
                  {signUpLoading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
              <OAuthButtons label="Sign up" />
            </TabsContent>
          </Tabs>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          By continuing, you agree to our{" "}
          <span className="underline cursor-pointer hover:text-foreground">Terms of Service</span>
          {" "}and{" "}
          <span className="underline cursor-pointer hover:text-foreground">Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}
