import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { randomCredentials } from "@/hooks/use-player";
import { login, register } from "@/lib/slotegrator.functions";
import { ErrorDetails, errorText } from "@/components/ErrorDetails";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function authErrorTitle(code: string) {
  if (code === "USERNAME_TAKEN") return "এই নামটি আগেই নেওয়া হয়েছে।";
  if (code === "INVALID_LOGIN") return "নাম বা পাসওয়ার্ড ভুল।";
  return "সাইন-ইন করা যায়নি।";
}

export function AuthDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const doRegister = useServerFn(register);
  const doLogin = useServerFn(login);
  const client = useQueryClient();

  async function run(fn: () => Promise<{ ok: boolean; error: string | null }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError({ title: authErrorTitle(res.error ?? ""), detail: res.error ?? "Unknown error" });
        return false;
      }
      await client.invalidateQueries({ queryKey: ["player"] });
      return true;
    } catch (e) {
      setError({ title: "সার্ভারে সমস্যা হয়েছে", detail: errorText(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function oneClick() {
    const creds = randomCredentials();
    if (await run(() => doRegister({ data: creds }))) setCreated(creds);
  }

  async function submit(mode: "login" | "register") {
    const u = username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) {
      setError({ title: "নাম ঠিক নেই", detail: "নাম ৩–২০ অক্ষরের হতে হবে (a-z, 0-9, _)।" });
      return;
    }
    if (password.length < 8) {
      setError({ title: "পাসওয়ার্ড ছোট", detail: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।" });
      return;
    }
    const data = { username: u, password };
    const ok = await run(() => (mode === "register" ? doRegister({ data }) : doLogin({ data })));
    if (ok) {
      toast.success(mode === "register" ? "অ্যাকাউন্ট তৈরি হয়েছে!" : "স্বাগতম!");
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setCreated(null);
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-gold">Golden Reels</DialogTitle>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              আপনার অ্যাকাউন্ট তৈরি হয়েছে এবং আপনি লগইন আছেন। নিচের নাম ও পাসওয়ার্ড অবশ্যই লিখে রাখুন —
              পরে আবার লগইন করতে এগুলো লাগবে।
            </p>
            <div className="space-y-2 rounded-lg border bg-muted p-4 font-mono text-sm">
              <p>নাম: {created.username}</p>
              <p>পাসওয়ার্ড: {created.password}</p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(`নাম: ${created.username}\nপাসওয়ার্ড: ${created.password}`);
                toast.success("কপি হয়েছে");
              }}
            >
              <Copy /> কপি করুন
            </Button>
            <Button variant="gold" className="w-full" onClick={() => onOpenChange(false)}>
              খেলা শুরু করুন
            </Button>
          </div>
        ) : (
          <>
            {error && <ErrorDetails title={error.title} detail={error.detail} onClose={() => setError(null)} />}
            <Tabs defaultValue="quick" onValueChange={() => setError(null)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="quick">এক ক্লিকে</TabsTrigger>
                <TabsTrigger value="login">লগইন</TabsTrigger>
                <TabsTrigger value="register">রেজিস্টার</TabsTrigger>
              </TabsList>
              <TabsContent value="quick" className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">এক ক্লিকেই অ্যাকাউন্ট — নাম ও পাসওয়ার্ড আমরা বানিয়ে দেব।</p>
                <Button variant="gold" className="w-full" size="lg" onClick={oneClick} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  এক ক্লিকে রেজিস্টার
                </Button>
              </TabsContent>
              {(["login", "register"] as const).map((mode) => (
                <TabsContent key={mode} value={mode} className="space-y-4 pt-4">
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submit(mode);
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`${mode}-u`}>ইউজারনেম</Label>
                      <Input id={`${mode}-u`} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${mode}-p`}>পাসওয়ার্ড</Label>
                      <Input
                        id={`${mode}-p`}
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                      />
                    </div>
                    <Button type="submit" variant="gold" className="w-full" disabled={busy}>
                      {busy && <Loader2 className="animate-spin" />}
                      {mode === "login" ? "লগইন" : "অ্যাকাউন্ট খুলুন"}
                    </Button>
                  </form>
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
