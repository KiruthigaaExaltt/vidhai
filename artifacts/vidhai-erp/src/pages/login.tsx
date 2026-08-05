import { useState } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import vidhaiLogo from "@assets/vidhai-logo-transparent.png";
import maharishiImage from "@assets/maharishi-for-vsp_1783669693733.jpg";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const loginMutation = useLogin();
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await loginMutation.mutateAsync({ data: { username, password } });
      login(res.user);
      setLocation("/");
    } catch (err: any) {
      toast({
        title: "Login Failed",
        description: err?.message || "Invalid credentials",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex w-1/2 items-center justify-center bg-[#EAFAF7] border-r border-border relative overflow-hidden">
        <div className="flex flex-col items-center gap-6 px-12">
          <img src={vidhaiLogo} alt="Vidhai logo" className="w-[420px] max-w-full object-contain" />
          <div className="text-center">
            <p className="text-sm tracking-[0.3em] uppercase text-[#178F80] font-semibold">Nilgiri Farm Produce</p>
            <p className="text-xs tracking-widest uppercase text-muted-foreground mt-2">Multi-Site Production Control</p>
          </div>
        </div>
      </div>

      <div className="flex w-full lg:w-1/2 flex-col items-center">
        <div className="w-full flex items-center justify-center pt-10 pb-6 px-6">
          <img
            src={maharishiImage}
            alt="Maharishi"
            className="w-full max-w-md object-cover rounded-sm"
          />
        </div>
        <div className="w-full max-w-sm px-6 pb-10">
          <div className="flex flex-col items-center mb-10">
            <img src={vidhaiLogo} alt="Vidhai logo" className="w-20 h-20 object-contain mb-4 lg:hidden" />
            <h1 className="text-2xl font-serif tracking-wider text-foreground">VIDHAI ERP</h1>
            <p className="text-sm text-muted-foreground mt-1">Production Control Center</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-muted-foreground text-xs uppercase tracking-wider">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground text-xs uppercase tracking-wider">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="font-mono"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-sm tracking-wide mt-4"
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
