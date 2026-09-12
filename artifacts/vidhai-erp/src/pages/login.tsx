import { useEffect, useState } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, User, Lock, LockKeyhole, Loader2, ArrowRight } from "lucide-react";
import vidhaiLogo from "@assets/vidhai-logo-transparent.png";
import maharishiImage from "@assets/maharishi-login-cutout.png";
import { encryptLoginPassword } from "@/lib/loginEncryption";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const loginMutation = useLogin();
  const { login, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && user) setLocation("/dashboard");
  }, [isLoading, user, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const encryptedPassword = await encryptLoginPassword(password);
      const res = await loginMutation.mutateAsync({
        data: {
          username,
          password: encryptedPassword,
          passwordEncoding: "rsa-oaep-256",
        },
      });
      login(res.user, res.accessToken);
      setLocation("/dashboard");
    } catch (err: any) {
      toast({
        title: "Login Failed",
        description: err?.message || "Invalid credentials",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-[100svh] w-full grid grid-cols-1 lg:grid-cols-2 bg-background box-border">
      {/* Left Branding Section */}
      <div className="hidden lg:flex flex-col items-center justify-center bg-[#EAFAF7] dark:bg-slate-900/50 border-r border-border p-8 lg:p-12">
        <div className="flex flex-col items-center justify-center gap-8 max-w-[420px] w-full">
          <img
            src={vidhaiLogo}
            alt="Vidhai logo"
            className="w-full h-auto object-contain drop-shadow-sm"
          />
          <div className="flex flex-col items-center text-center gap-2">
            <p className="text-sm tracking-[0.3em] uppercase text-[#178F80] font-semibold m-0">
              Nilgiri Farm Produce
            </p>
            <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium m-0">
              Multi-Site Production Control
            </p>
          </div>
        </div>
      </div>

      {/* Right Login Section */}
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 lg:p-12 min-h-[100svh] w-full bg-slate-50/40 dark:bg-background">
        {/* ONE RESPONSIVE GROUP */}
        <div className="w-full max-w-[400px] flex flex-col items-center gap-7">
          {/* Mobile logo */}
          <img
            src={vidhaiLogo}
            alt="Vidhai logo"
            className="w-20 h-20 object-contain lg:hidden"
          />

          {/* Login Image with Glow */}
          <div className="relative isolate mx-auto h-[250px] w-full sm:h-[280px]">
            <div className="absolute left-1/2 top-[44%] -z-20 h-[82%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(20,184,166,0.68)_0%,rgba(20,184,166,0.34)_45%,rgba(20,184,166,0.12)_65%,transparent_78%)] blur-2xl" />

            <svg
              aria-hidden="true"
              viewBox="0 0 400 300"
              className="absolute inset-0 -z-10 h-full w-full fill-[#14b8a6] opacity-[0.13]"
            >
              <path d="M105 235c27-30 40-64 38-105 20 34 16 71-10 105-10 13-22 23-35 31 0-11 3-21 7-31Zm20-62c-30-1-54-14-71-40 31-2 57 10 77 34l-6 6Zm8-40c-20-12-33-30-37-54 26 9 43 27 51 52-5-1-10 0-14 2Zm162 102c-27-30-40-64-38-105-20 34-16 71 10 105 10 13 22 23 35 31 0-11 3-21 7-31Zm-20-62c30-1 54-14 71-40-31-2-57 10-77 34l6 6Zm-8-40c20-12 33-30 37-54-26 9-43 27-51 52 5-1 10 0 14 2Z" />
            </svg>

            <img
              src={maharishiImage}
              alt="Maharishi"
              className="relative mx-auto h-full w-full object-contain object-top [mask-image:linear-gradient(to_bottom,black_0%,black_72%,transparent_100%)]"
            />
            <div className="pointer-events-none absolute inset-x-[8%] bottom-0 h-[25%] bg-gradient-to-b from-transparent to-slate-50/40 dark:to-background" />
          </div>

          {/* Heading */}
          <div className="flex flex-col items-center text-center gap-1.5 w-full">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 m-0">
              Vidhaii ERP
            </h1>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 m-0">
              Production Control Center
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
            {/* Username Field */}
            <div className="space-y-1.5">
              <Label
                htmlFor="username"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide"
              >
                Username
              </Label>
              <div className="group relative flex items-center h-12 w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:border-slate-300 dark:hover:border-slate-700 focus-within:border-[#00BDA5] focus-within:ring-2 focus-within:ring-[#00BDA5]/20 transition-all duration-200">
                <div className="flex items-center justify-center w-8 h-8 ml-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-focus-within:bg-[#00BDA5]/10 group-focus-within:text-[#00BDA5] transition-all duration-200 shrink-0">
                  <User className="h-4 w-4" />
                </div>
                <input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="h-full w-full bg-transparent px-3 text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400/80 outline-none border-0 ring-0 focus:outline-none"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide"
              >
                Password
              </Label>
              <div className="group relative flex items-center h-12 w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:border-slate-300 dark:hover:border-slate-700 focus-within:border-[#00BDA5] focus-within:ring-2 focus-within:ring-[#00BDA5]/20 transition-all duration-200">
                <div className="flex items-center justify-center w-8 h-8 ml-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-focus-within:bg-[#00BDA5]/10 group-focus-within:text-[#00BDA5] transition-all duration-200 shrink-0">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-full w-full bg-transparent px-3 text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400/80 outline-none border-0 ring-0 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="mr-2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none cursor-pointer shrink-0"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button with exact Module Unlock Ledger styling */}
            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full h-12 mt-2 rounded-xl bg-[#00BDA5] hover:bg-[#00a894] active:bg-[#009b88] text-white font-medium flex items-center justify-between px-5 transition-all shadow-sm active:scale-[0.99] border-0 cursor-pointer"
            >
              {loginMutation.isPending ? (
                <span className="mx-auto flex items-center gap-2 text-white">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing In...
                </span>
              ) : (
                <>
                  <svg
                    className="h-4 w-4 text-white/50 fill-current shrink-0"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z" />
                  </svg>
                  <span className="flex items-center gap-2 font-semibold text-[15px] text-white">
                    <LockKeyhole className="h-4 w-4 stroke-[2.2]" />
                    Sign In
                  </span>
                  <ArrowRight className="h-4 w-4 text-white stroke-[2.2] shrink-0" />
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
