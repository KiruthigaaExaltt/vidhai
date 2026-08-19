import { useState } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
import vidhaiLogo from "@assets/vidhai-logo-transparent.png";
import maharishiImage from "@assets/maharishi-login-cutout.png";
import { encryptLoginPassword } from "@/lib/loginEncryption";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const loginMutation = useLogin();
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
      setLocation("/");
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
      <div className="hidden lg:flex flex-col items-center justify-center bg-[#EAFAF7] border-r border-border p-8 lg:p-12">
        <div className="flex flex-col items-center justify-center gap-8 max-w-[420px] w-full">
          <img
            src={vidhaiLogo}
            alt="Vidhai logo"
            className="w-full h-auto object-contain"
          />
          <div className="flex flex-col items-center text-center gap-2">
            <p className="text-sm tracking-[0.3em] uppercase text-[#178F80] font-semibold m-0">
              Nilgiri Farm Produce
            </p>
            <p className="text-xs tracking-widest uppercase text-muted-foreground m-0">
              Multi-Site Production Control
            </p>
          </div>
        </div>
      </div>

      {/* Right Login Section */}
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 lg:p-12 min-h-[100svh] w-full">
        {/* ONE RESPONSIVE GROUP */}
        <div className="w-full max-w-[400px] flex flex-col items-center gap-8">
          {/* Mobile logo */}
          <img
            src={vidhaiLogo}
            alt="Vidhai logo"
            className="w-20 h-20 object-contain lg:hidden"
          />

          {/* Login Image */}
          <div className="relative isolate mx-auto h-[260px] w-full sm:h-[300px]">
            <div className="absolute left-1/2 top-[44%] -z-20 h-[82%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(20,184,166,0.68)_0%,rgba(20,184,166,0.34)_45%,rgba(20,184,166,0.12)_65%,transparent_78%)] blur-2xl" />

            <svg
              aria-hidden="true"
              viewBox="0 0 400 300"
              className="absolute inset-0 -z-10 h-full w-full fill-[#14b8a6] opacity-[0.13]"
            >
              <path d="M105 235c27-30 40-64 38-105 20 34 16 71-10 105-10 13-22 23-35 31 0-11 3-21 7-31Zm20-62c-30-1-54-14-71-40 31-2 57 10 77 34l-6 6Zm8-40c-20-12-33-30-37-54 26 9 43 27 51 52-5-1-10 0-14 2Zm162 102c-27-30-40-64-38-105-20 34-16 71 10 105 10 13 22 23 35 31 0-11-3-21-7-31Zm-20-62c30-1 54-14 71-40-31-2-57 10-77 34l6 6Zm-8-40c20-12 33-30 37-54-26 9-43 27-51 52 5-1 10 0 14 2Z" />
            </svg>

            <img
              src={maharishiImage}
              alt="Maharishi"
              className="relative mx-auto h-full w-full object-contain object-top [mask-image:linear-gradient(to_bottom,black_0%,black_72%,transparent_100%)]"
            />
            <div className="pointer-events-none absolute inset-x-[8%] bottom-0 h-[25%] bg-gradient-to-b from-transparent to-background" />
          </div>

          {/* Heading */}
          <div className="flex flex-col items-center text-center gap-1 w-full">
            <h1 className="text-2xl font-serif tracking-wider text-foreground m-0">
              VIDHAI ERP
            </h1>
            <p className="text-sm text-muted-foreground m-0">
              Production Control Center
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="username"
                className="text-muted-foreground text-xs uppercase tracking-wider"
              >
                Username
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="font-mono w-full"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="password"
                className="text-muted-foreground text-xs uppercase tracking-wider"
              >
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="font-mono w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-sm tracking-wide mt-2 h-11"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "AUTHENTICATING..." : "AUTHENTICATE"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
