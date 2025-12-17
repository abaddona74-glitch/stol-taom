"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowBigLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MeResponse = {
  user?: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
    roles?: { name: string; scopeType: string; scopeId?: string | null }[];
  } | null;
};

export default function ProfileClientSafe() {
  const router = useRouter();
  const [me, setMe] = React.useState<MeResponse["user"] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: MeResponse) => {
        if (!active) return;
        setMe(d.user ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <Button onClick={() => router.push("/home")} className="h-10 w-10 p-0">
          <ArrowBigLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Profil</h1>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="mb-4">
            <h2 className="text-base font-semibold mb-2">Rollar</h2>
            <div className="flex gap-2 flex-wrap">
              {me?.roles && me.roles.length > 0 ? (
                me.roles.map((r) => (
                  <span
                    key={`${r.name}-${r.scopeType}-${r.scopeId ?? "any"}`}
                    className="inline-flex items-center px-2 py-1 rounded-full bg-white/10 text-xs"
                  >
                    {r.name}
                    {r.scopeType !== "global" && (
                      <span className="ml-1 text-xxs text-gray-300">
                        ({r.scopeType}
                        {r.scopeId ? ":" + r.scopeId : ""})
                      </span>
                    )}
                  </span>
                ))
              ) : (
                <div className="text-sm text-gray-400">Sizda rol topilmadi</div>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold mb-2">Ma'lumotlar</h2>
            <div className="grid gap-3">
              <Input value={me?.name ?? ""} readOnly />
              <Input value={me?.email ?? ""} readOnly />
              <Input value={me?.phone ?? ""} readOnly />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
