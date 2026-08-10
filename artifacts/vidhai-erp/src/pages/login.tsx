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
    <div className="min-h-[100svh] w-full grid grid-cols-1 lg:grid-cols-2 bg-background box-border">
      {/* Left Branding Section */}
      <div className="hidden lg:flex flex-col items-center justify-center bg-[#EAFAF7] border-r border-border p-8 lg:p-12">
        <div className="flex flex-col items-center justify-center gap-8 max-w-[420px] w-full">
          <img src={vidhaiLogo} alt="Vidhai logo" className="w-full h-auto object-contain" />
          <div className="flex flex-col items-center text-center gap-2">
            <p className="text-sm tracking-[0.3em] uppercase text-[#178F80] font-semibold m-0">Nilgiri Farm Produce</p>
            <p className="text-xs tracking-widest uppercase text-muted-foreground m-0">Multi-Site Production Control</p>
          </div>
        </div>
      </div>
 
      {/* Right Login Section */}
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 lg:p-12 min-h-[100svh] w-full">
        {/* ONE RESPONSIVE GROUP */}
        <div className="w-full max-w-[400px] flex flex-col items-center gap-8">
         
          {/* Mobile logo */}
          <img src={vidhaiLogo} alt="Vidhai logo" className="w-20 h-20 object-contain lg:hidden" />
 
          {/* Login Image */}
          <img
            src={maharishiImage}
            alt="Maharishi"
            className="w-full h-auto max-h-[260px] object-cover rounded-sm"
          />
 
          {/* Heading */}
          <div className="flex flex-col items-center text-center gap-1 w-full">
            <h1 className="text-2xl font-serif tracking-wider text-foreground m-0">VIDHAI ERP</h1>
            <p className="text-sm text-muted-foreground m-0">Production Control Center</p>
          </div>
 
          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username" className="text-muted-foreground text-xs uppercase tracking-wider">Username</Label>
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
              <Label htmlFor="password" className="text-muted-foreground text-xs uppercase tracking-wider">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="font-mono w-full"
              />
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
 