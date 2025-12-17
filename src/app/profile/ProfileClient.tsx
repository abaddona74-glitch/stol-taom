"use client";
import * as Tabs from "@radix-ui/react-tabs";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowBigLeft } from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import AuthSessionTimer from "@/components/AuthSessionTimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RedisDebugger from "./RedisDebugger";
import ThemeManager from "./ThemeManager";

type MeResponse = {
  user?: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
    avatarUrl?: string;
    locale?: string;
    timezone?: string;
    roles?: Array<{
      name: string;
      scopeType?: string | null;
      scopeId?: string | null;
    }>;
  } | null;
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/5 p-4">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function ProfileClient() {
  const [tab, setTab] = React.useState("account");
  const router = useRouter();
  const { theme } = useTheme();
  // Only show dev/debug tabs when running in non-production or when
  // NEXT_PUBLIC_DEV_ADMIN is explicitly enabled at build time.
  const devAdminEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_DEV_ADMIN === "true";

  React.useEffect(() => {
    console.log(
      "[ProfileClient] Mounted, current theme:",
      localStorage.getItem("app-theme"),
      "HTML classes:",
      document.documentElement.className,
    );
  }, []);

  // Account state
  const [me, setMe] = React.useState<MeResponse["user"] | null>(null);
  const [loadingMe, setLoadingMe] = React.useState(true);
  const [errorMe, setErrorMe] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [editName, setEditName] = React.useState("");
  const [editEmail, setEditEmail] = React.useState("");
  const [editPhone, setEditPhone] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  type ProfileUpdateRequest = {
    name?: string;
    email?: string;
    phone?: string;
  };
  type ProfileUpdateResponse = {
    success?: boolean;
    requestId?: string;
    phone?: string;
    user?: { id: string; name?: string; phone?: string };
    error?: string;
    retryAfterSec?: number;
    detail?: unknown;
  };

  React.useEffect(() => {
    let active = true;
    setLoadingMe(true);
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(async (r) => {
        if (r.status === 401) {
          // Not authenticated: redirect to login preserving return path
          if (active) {
            const from = encodeURIComponent("/profile");
            window.location.href = `/login?from=${from}`;
          }
          return Promise.reject("unauthorized");
        }
        if (!r.ok) return Promise.reject(r);
        return r.json();
      })
      .then((d: MeResponse) => {
        if (!active) return;
        setMe(d.user ?? null);
      })
      .catch((err) => {
        if (!active) return;
        if (err !== "unauthorized")
          setErrorMe("Ma'lumotlarni yuklashda xatolik");
      })
      .finally(() => {
        if (active) setLoadingMe(false);
      });

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (me) {
      setEditName(me.name ?? "");
      setEditEmail(me.email ?? "");
      setEditPhone(me.phone ?? "");
    }
  }, [me]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    window.location.href = "/login";
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Desktop-only fixed back button (top-left). Visible on md+ screens, stays while scrolling. */}
      <Button
        onClick={() => router.push("/home")}
        className={
          `fixed top-4 left-4 z-50 hidden md:flex h-10 w-10 p-0 items-center justify-center shadow-md cursor-pointer hover:opacity-90 ` +
          (theme === "light"
            ? "bg-white text-black border border-gray-200"
            : "bg-black text-white")
        }
        aria-label="Orqaga"
        title="Orqaga"
      >
        <ArrowBigLeft className="h-5 w-5" />
      </Button>
      <h1 className="mb-4 text-2xl font-bold">Profil</h1>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="mb-4 flex gap-2 border-b border-white/10 pb-2">
          <Tabs.Trigger
            value="account"
            className={`rounded px-3 py-1 text-sm ${tab === "account" ? "bg-white/10" : "hover:bg-white/5"}`}
          >
            Account
          </Tabs.Trigger>
          <Tabs.Trigger
            value="security"
            className={`rounded px-3 py-1 text-sm ${tab === "security" ? "bg-white/10" : "hover:bg-white/5"}`}
          >
            Security
          </Tabs.Trigger>
          <Tabs.Trigger
            value="premium"
            className={`rounded px-3 py-1 text-sm ${tab === "premium" ? "bg-white/10" : "hover:bg-white/5"}`}
          >
            Premium
          </Tabs.Trigger>
          {devAdminEnabled && (
            <Tabs.Trigger
              value="redis"
              className={`rounded px-3 py-1 text-sm ${tab === "redis" ? "bg-white/10" : "hover:bg-white/5"}`}
            >
              Redis
            </Tabs.Trigger>
          )}
          <Tabs.Trigger
            value="theme"
            className={`rounded px-3 py-1 text-sm ${tab === "theme" ? "bg-white/10" : "hover:bg-white/5"}`}
          >
            Tema
          </Tabs.Trigger>
          {/* Reservations moved to /orders */}
        </Tabs.List>

        <Tabs.Content value="account" className="space-y-4">
          <Section title="Foydalanuvchi ma'lumotlari">
            {loadingMe ? (
              <div className="animate-pulse space-y-3">
                <div className="h-6 w-48 rounded bg-white/10" />
                <div className="h-10 w-full rounded bg-white/10" />
                <div className="h-10 w-full rounded bg-white/10" />
                <div className="h-10 w-2/3 rounded bg-white/10" />
              </div>
            ) : errorMe ? (
              <div className="text-sm text-red-500">{errorMe}</div>
            ) : me ? (
              <>
                <div className="sm:col-span-2 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {(me.roles && me.roles.length > 0
                      ? me.roles.map((r) => r.name)
                      : ["client"]
                    ).map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-medium text-gray-100"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
                <form className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="me-name"
                      className="mb-1 block text-sm text-gray-300"
                    >
                      Ism
                    </label>
                    <Input
                      id="me-name"
                      value={editing ? editName : (me.name ?? "")}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={!editing}
                      readOnly={!editing}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="me-email"
                      className="mb-1 block text-sm text-gray-300"
                    >
                      Email
                    </label>
                    <Input
                      id="me-email"
                      value={editing ? editEmail : (me.email ?? "")}
                      onChange={(e) => setEditEmail(e.target.value)}
                      disabled={!editing}
                      readOnly={!editing}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="me-phone"
                      className="mb-1 block text-sm text-gray-300"
                    >
                      Telefon
                    </label>
                    <Input
                      id="me-phone"
                      value={editing ? editPhone : (me.phone ?? "")}
                      onChange={(e) => setEditPhone(e.target.value)}
                      disabled={!editing}
                      readOnly={!editing}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="me-locale"
                      className="mb-1 block text-sm text-gray-300"
                    >
                      Til
                    </label>
                    <Input
                      id="me-locale"
                      value={me.locale ?? "uz"}
                      disabled
                      readOnly
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="me-timezone"
                      className="mb-1 block text-sm text-gray-300"
                    >
                      Vaqt mintaqasi
                    </label>
                    <Input
                      id="me-timezone"
                      value={
                        me.timezone ??
                        Intl.DateTimeFormat().resolvedOptions().timeZone
                      }
                      disabled
                      readOnly
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-center justify-between">
                    <div className="text-xs text-gray-400">
                      Profildagi ma'lumotni tahrirlash
                    </div>
                    <div className="flex gap-2">
                      {editing ? (
                        <>
                          <Button
                            onClick={async () => {
                              // Cancel
                              setEditing(false);
                              if (me) {
                                setEditName(me.name ?? "");
                                setEditEmail(me.email ?? "");
                                setEditPhone(me.phone ?? "");
                              }
                            }}
                            variant="outline"
                          >
                            Bekor qilish
                          </Button>
                          <Button
                            onClick={async () => {
                              // Save
                              if (!me) return;
                              setSaving(true);
                              try {
                                const payload: ProfileUpdateRequest = {
                                  name: editName,
                                  email: editEmail,
                                };
                                if (editPhone !== me.phone)
                                  payload.phone = editPhone;
                                const res = await fetch("/api/profile/update", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify(payload),
                                });
                                const data =
                                  (await res.json()) as ProfileUpdateResponse;
                                if (!res.ok)
                                  throw new Error(data.error || "Xatolik");
                                // If phone change initiated, redirect to verify
                                if (data.requestId && data.phone) {
                                  const url = new URL(
                                    `/verify`,
                                    window.location.origin,
                                  );
                                  url.searchParams.set(
                                    "phone",
                                    String(data.phone),
                                  );
                                  url.searchParams.set(
                                    "requestId",
                                    String(data.requestId),
                                  );
                                  url.searchParams.set("from", "profile");
                                  window.location.href = url.toString();
                                  return;
                                }
                                // Otherwise, update local state
                                setMe((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        name: editName,
                                        email: editEmail,
                                        phone: editPhone,
                                      }
                                    : prev,
                                );
                                setEditing(false);
                              } catch (e: unknown) {
                                const msg =
                                  e instanceof Error ? e.message : String(e);
                                setErrorMe(msg);
                              } finally {
                                setSaving(false);
                              }
                            }}
                            disabled={saving}
                          >
                            Saqlash
                          </Button>
                        </>
                      ) : (
                        <Button onClick={() => setEditing(true)}>
                          Tahrirlash
                        </Button>
                      )}
                    </div>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-sm text-gray-400">Ma'lumot topilmadi</div>
            )}
          </Section>
        </Tabs.Content>

        <Tabs.Content value="security" className="space-y-4">
          <Section title="Sessiyalar">
            <div className="flex flex-col gap-3">
              <AuthSessionTimer />
              <div className="text-sm text-gray-400">
                Faol sessiya: ushbu qurilma
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleLogout}
                  className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md shadow-sm"
                >
                  Chiqish (ushbu qurilma)
                </Button>
              </div>
            </div>
          </Section>
        </Tabs.Content>

        <Tabs.Content value="premium" className="space-y-4">
          <Section title="Premium obuna">
            <div className="space-y-3 text-sm text-gray-300">
              <p>
                Premium foydalanuvchilar quyidagi imkoniyatlarga ega bo'ladi:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Tezroq buyurtma va bron ustuvorligi</li>
                <li>Maxsus chegirmalar va aksiyalar</li>
                <li>Qo'shimcha qo'llab-quvvatlash</li>
              </ul>
              <div className="pt-2">
                <Button
                  onClick={async () => {
                    // Placeholder action; integrate real checkout when available
                    alert("Premium olish tez orada mavjud bo'ladi.");
                  }}
                  className="bg-[#C8FF00] hover:bg-[#B8EF00] text-black font-semibold"
                >
                  Premium olish
                </Button>
              </div>
            </div>
          </Section>
        </Tabs.Content>

        {devAdminEnabled && (
          <Tabs.Content value="redis" className="space-y-4">
            <Section title="Redis Debugger">
              <RedisDebugger />
            </Section>
          </Tabs.Content>
        )}

        <Tabs.Content value="theme" className="space-y-4">
          <Section title="Tema Sozlamalari">
            <ThemeManager />
          </Section>
        </Tabs.Content>

        {/* Reservations moved to /orders */}
      </Tabs.Root>
    </div>
  );
}
