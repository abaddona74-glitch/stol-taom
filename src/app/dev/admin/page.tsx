"use client";
import React from "react";
import { useTheme, type ThemeMode } from "@/lib/theme-context";
import { apiFetch } from "@/lib/apiFetch";
import { useRouter } from "next/navigation";

function AdminSectionHeader({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold mt-6 mb-2">{children}</h2>;
}

export default function DevAdminPage() {
  const router = useRouter();
  const [restaurants, setRestaurants] = React.useState<any[]>([]);
  const [menuItems, setMenuItems] = React.useState<any[]>([]);
  const [ingredients, setIngredients] = React.useState<any[]>([]);
  const [loadingIngredients, setLoadingIngredients] = React.useState(false);
  const [canEditIngredients, setCanEditIngredients] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [impersonating, setImpersonating] = React.useState<string | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = React.useState<
    any | null
  >(null);

  const STORAGE_KEY = "dev:impersonate_restaurant";

  const [restForm, setRestForm] = React.useState({
    id: "",
    name: "",
    logoUrl: "",
    openTime: "",
    closeTime: "",
    ownerPhone: "",
  });
  const [menuForm, setMenuForm] = React.useState({
    id: "",
    name: "",
    slug: "",
    logoUrl: "",
    restaurantId: "",
    price: "",
  });
  const [ingForm, setIngForm] = React.useState({
    menuId: "",
    ingredientsText: "",
  });
  const [rolePhone, setRolePhone] = React.useState("");
  const [roleInput, setRoleInput] = React.useState("");
  const [roleRestaurant, setRoleRestaurant] = React.useState<string | "">("");
  const [roleSaveStatus, setRoleSaveStatus] = React.useState<string | null>(
    null,
  );
  const [roleProcessing, setRoleProcessing] = React.useState(false);
  const rolePresets: Array<{ key: string; label: string; desc?: string }> = [
    { key: "owner", label: "Owner", desc: "Sees everything; full access" },
    {
      key: "manager",
      label: "Manager",
      desc: "Manage orders, staff, customers",
    },
  ];
  const [selectedPresetRoles, setSelectedPresetRoles] = React.useState<
    string[]
  >([]);
  const [myRoles, setMyRoles] = React.useState<string[] | null>(null);
  const [managers, setManagers] = React.useState<Array<{
    userId: string;
    phone?: string;
    name?: string;
  }> | null>(null);
  const [managerPhone, setManagerPhone] = React.useState("");
  const [managerActionStatus, setManagerActionStatus] = React.useState<
    string | null
  >(null);

  // Theme controls (optional; ThemeProvider may not be present in some test contexts)
  let themeContext: { theme: ThemeMode; setTheme: (t: ThemeMode) => void } | null = null;
  try {
    themeContext = useTheme();
  } catch (e) {
    themeContext = null;
  }

  const setGlobalTheme = (t: ThemeMode) => {
    try {
      themeContext?.setTheme(t);
    } catch (e) {
      console.error("Failed to set global theme", e);
    }
  };

  

  React.useEffect(() => {
    let mounted = true;
    async function checkRole() {
      try {
        const res = await apiFetch(
          "/api/dev/admin/role?role=ingredient_editor",
        );
        if (!mounted) return;
        if (!res.ok) {
          setCanEditIngredients(false);
          return;
        }
        const j = await res.json();
        setCanEditIngredients(Boolean(j?.allowed));
      } catch (e) {
        setCanEditIngredients(false);
      }
    }
    void checkRole();
    async function load() {
      setLoading(true);
      setFetchError(null);
      try {
        const r1 = await apiFetch("/api/dev/admin/restaurant");
        if (!mounted) return;
        if (!r1.ok) {
          const jr = await r1.json().catch(() => null);
          const msg = `restaurant: ${r1.status} ${jr?.error ?? JSON.stringify(jr)}`;
          console.error("[dev-admin] load error", msg);
          setFetchError(msg);
          setRestaurants([]);
          setMenuItems([]);
          return;
        }
        const jr = await r1.json();
        setRestaurants(jr.items || []);

        // If impersonating, load that restaurant's menu; otherwise load global menu
        const stored =
          typeof window !== "undefined"
            ? localStorage.getItem(STORAGE_KEY)
            : null;
        if (stored) {
          setImpersonating(stored);
          // load restaurant-scoped menu
          const rm = await apiFetch(
            `/api/restaurants/${encodeURIComponent(stored)}/menu`,
          );
          const rjm = await rm.json().catch(() => null);
          setMenuItems(rjm?.items || rjm || []);
          // load restaurant details
          const rd = await apiFetch(
            `/api/restaurants/${encodeURIComponent(stored)}`,
          );
          const rdata = await rd.json().catch(() => null);
          setSelectedRestaurant(rdata || null);
        } else {
          const r2 = await apiFetch("/api/dev/admin/menu");
          if (!r2.ok) {
            const jm = await r2.json().catch(() => null);
            const msg = `menu: ${r2.status} ${jm?.error ?? JSON.stringify(jm)}`;
            console.error("[dev-admin] load error", msg);
            setFetchError(msg);
            setMenuItems([]);
            return;
          }
          const jm = await r2.json();
          setMenuItems(jm.items || []);
        }
      } catch (err: any) {
        console.error("[dev-admin] load exception", err);
        setFetchError(String(err?.message ?? err));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  async function saveRestaurant(e?: React.FormEvent) {
    e?.preventDefault();
    const res = await apiFetch("/api/dev/admin/restaurant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(restForm),
    });
    const j = await res.json();
    if (res.ok) {
      // refresh
      const r = await fetch("/api/dev/admin/restaurant");
      const jr = await r.json();
      setRestaurants(jr.items || []);
      setRestForm({
        id: "",
        name: "",
        logoUrl: "",
        openTime: "",
        closeTime: "",
        ownerPhone: "",
      });
    } else {
      alert(j.error || "Error");
    }
  }

  async function saveMenuItem(e?: React.FormEvent) {
    e?.preventDefault();
    // If we're impersonating an owner, ensure the menu item is attached to that restaurant unless explicitly chosen
    const payload = { ...menuForm };
    try {
      if (!payload.restaurantId && impersonating)
        payload.restaurantId = impersonating;
    } catch (e) {}
    const res = await apiFetch("/api/dev/admin/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (res.ok) {
      const r = await fetch("/api/dev/admin/menu");
      const jm = await r.json();
      setMenuItems(jm.items || []);
      setMenuForm({
        id: "",
        name: "",
        slug: "",
        logoUrl: "",
        restaurantId: "",
        price: "",
      });
    } else {
      alert(j.error || "Error");
    }
  }

  async function saveIngredients(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ingForm.menuId) return alert("Select menu id");
    // parse ingredientsText as comma-separated `name[:mandatory]`, e.g. "Cheese,true,Basil,false"
    const parts = ingForm.ingredientsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ingredients = parts.map((p) => {
      const [name, mandatory] = p.split(":").map((x) => x.trim());
      return { name, mandatory: mandatory === "true" };
    });
    const res = await apiFetch(`/api/menu/${ingForm.menuId}/ingredients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredients }),
    });
    const j = await res.json();
    if (res.ok) {
      alert("Ingredients updated");
      setIngForm({ menuId: "", ingredientsText: "" });
    } else {
      alert(j.error || "Error");
    }
  }

  async function loadManagers(restaurantId: string) {
    try {
      const res = await apiFetch(
        `/api/dev/admin/managers?restaurantId=${encodeURIComponent(restaurantId)}`,
      );
      if (!res.ok) {
        setManagers([]);
        return;
      }
      const j = await res.json();
      setManagers(j.items || []);
    } catch (e) {
      setManagers([]);
    }
  }

  async function addManager(e?: React.FormEvent) {
    e?.preventDefault();
    setManagerActionStatus(null);
    if (!selectedRestaurant?.id)
      return setManagerActionStatus("Select a restaurant first");
    if (!managerPhone) return setManagerActionStatus("Provide phone");
    try {
      const res = await apiFetch("/api/dev/admin/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: selectedRestaurant.id,
          phone: managerPhone,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok)
        return setManagerActionStatus(j?.error || `Status ${res.status}`);
      if (j?.tempPassword) {
        setManagerActionStatus(`Added — temp password: ${j.tempPassword}`);
      } else {
        setManagerActionStatus("Added");
      }
      setManagerPhone("");
      await loadManagers(selectedRestaurant.id);
    } catch (err) {
      setManagerActionStatus(String(err));
    }
  }

  async function removeManager(userId: string) {
    if (!selectedRestaurant?.id) return;
    if (!confirm("Remove manager?")) return;
    try {
      const res = await apiFetch("/api/dev/admin/managers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: selectedRestaurant.id, userId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) return alert(j?.error || `Status ${res.status}`);
      await loadManagers(selectedRestaurant.id);
    } catch (e) {
      alert(String(e));
    }
  }

  // Fetch existing ingredients when a menu item is selected in the form
  React.useEffect(() => {
    let mounted = true;
    async function loadIngredients(menuId: string) {
      setLoadingIngredients(true);
      try {
        const res = await apiFetch(
          `/api/menu/${encodeURIComponent(menuId)}/ingredients`,
        );
        if (!mounted) return;
        if (!res.ok) {
          setIngredients([]);
          return;
        }
        const j = await res.json();
        setIngredients(j.ingredients || []);
      } catch (err) {
        console.error("Failed to load ingredients", err);
        setIngredients([]);
      } finally {
        if (mounted) setLoadingIngredients(false);
      }
    }
    if (ingForm.menuId) {
      loadIngredients(ingForm.menuId);
    } else {
      setIngredients([]);
    }
    return () => {
      mounted = false;
    };
  }, [ingForm.menuId]);

  async function saveIngredientsFullList(
    menuId: string,
    list: Array<{ id?: string; name: string; mandatory?: boolean }>,
  ) {
    try {
      const payload = {
        ingredients: list.map((it) => ({
          name: it.name,
          mandatory: !!it.mandatory,
        })),
      };
      const res = await apiFetch(
        `/api/menu/${encodeURIComponent(menuId)}/ingredients`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error || "Failed to save ingredients");
        return false;
      }
      const j = await res.json().catch(() => null);
      return true;
    } catch (e) {
      alert(String(e));
      return false;
    }
  }

  async function handleDeleteIngredient(id: string) {
    if (!ingForm.menuId) return alert("No menu selected");
    if (!confirm("Delete this ingredient?")) return;
    const updated = ingredients
      .filter((i) => i.id !== id)
      .map((i) => ({ name: i.name, mandatory: !!i.mandatory }));
    const ok = await saveIngredientsFullList(ingForm.menuId, updated);
    if (ok) setIngredients(updated as any[]);
  }

  // Custom select component to avoid native option styling issues in dark mode
  function RestaurantSelect({
    value,
    onChange,
  }: {
    value: string | "";
    onChange: (v: string) => void;
  }) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
      function onDoc(e: MouseEvent) {
        if (!ref.current) return;
        if (!ref.current.contains(e.target as Node)) setOpen(false);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
      }
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDoc);
        document.removeEventListener("keydown", onKey);
      };
    }, []);

    const label =
      restaurants.find((r) => r.id === value)?.name ||
      "Assign for specific restaurant (optional)";

    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="w-full text-left rounded border px-2 py-1 bg-white dark:bg-gray-800 text-black dark:text-white"
        >
          {label}
        </button>
        {open ? (
          <ul className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded border bg-white dark:bg-gray-800 text-black dark:text-white">
            <li
              key="__none"
              className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Assign for specific restaurant (optional)
            </li>
            {restaurants.map((r) => (
              <li
                key={r.id}
                className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                onClick={() => {
                  onChange(r.id);
                  setOpen(false);
                }}
              >
                {r.name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  function MenuItemSelect({
    value,
    onChange,
  }: {
    value: string | "";
    onChange: (v: string) => void;
  }) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
      function onDoc(e: MouseEvent) {
        if (!ref.current) return;
        if (!ref.current.contains(e.target as Node)) setOpen(false);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
      }
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDoc);
        document.removeEventListener("keydown", onKey);
      };
    }, []);

    const label =
      menuItems.find((m) => m.id === value)?.name || "Select menu item";

    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="w-full text-left rounded border px-2 py-1 bg-white dark:bg-gray-800 text-black dark:text-white"
        >
          {label}
        </button>
        {open ? (
          <ul className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded border bg-white dark:bg-gray-800 text-black dark:text-white">
            <li
              key="__none"
              className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Select menu item
            </li>
            {menuItems.map((m) => (
              <li
                key={m.id}
                className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                {m.name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  // Editing inline removed: only delete is supported here to keep the UI simple.

  return (
    <main className="p-6 mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">Dev Admin</h1>
      <p className="text-sm text-gray-600">
        Developer admin tools (dev-only). Add restaurants, menu items,
        ingredients and edit images/prices.
      </p>

      {/* Theme controls: global + per-page */}
      <div className="mt-4 mb-4">
        <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3 flex items-center gap-3">
          <div className="flex-1 text-sm">
            Theme: <strong>{themeContext ? (themeContext.theme === "dark" ? "🌙 Dark" : "☀️ Light") : "(no ThemeProvider)"}</strong>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setGlobalTheme("dark")}
              className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
            >
              🌙 Dark
            </button>
            <button
              onClick={() => setGlobalTheme("light")}
              className="px-3 py-1 rounded bg-yellow-400 text-black text-sm"
            >
              ☀️ Light
            </button>
          </div>
        </div>
      </div>

      <AdminSectionHeader>Role Management</AdminSectionHeader>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <form
            onSubmit={async (e) => {
              e?.preventDefault();
              setRoleSaveStatus(null);
              try {
                if (!rolePhone) return setRoleSaveStatus("Provide phone");
                const freeRoles = roleInput
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const roles = Array.from(
                  new Set([...selectedPresetRoles, ...freeRoles]),
                );
                const payload: any = { phone: rolePhone, roles };
                if (roleRestaurant) payload.restaurantId = roleRestaurant;
                const res = await apiFetch("/api/dev/admin/role", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const j = await res.json().catch(() => null);
                if (!res.ok)
                  return setRoleSaveStatus(j?.error ?? `Status ${res.status}`);
                setRoleSaveStatus("Saved");
                setRolePhone("");
                setRoleInput("");
                setRoleRestaurant("");
              } catch (err) {
                setRoleSaveStatus(String(err));
              }
            }}
            className="space-y-2"
          >
            <input
              placeholder="Phone (e.g. +998901234567)"
              value={rolePhone}
              onChange={(e) => setRolePhone(e.target.value)}
              className="w-full rounded border px-2 py-1"
            />
            <input
              placeholder="Roles (comma-separated) e.g. ingredient_editor"
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              className="w-full rounded border px-2 py-1"
            />
            <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              Preset roles (click to toggle):
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1 mb-2">
              {rolePresets.map((p) => {
                const active = selectedPresetRoles.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setSelectedPresetRoles((s) =>
                        s.includes(p.key)
                          ? s.filter((x) => x !== p.key)
                          : [...s, p.key],
                      );
                    }}
                    className={`text-left px-2 py-1 rounded border transition-colors duration-150 ${active ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-transparent dark:text-gray-300 dark:border-gray-700"}`}
                    title={p.desc}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <RestaurantSelect
              value={roleRestaurant}
              onChange={(v) => setRoleRestaurant(v)}
            />
            <div className="flex gap-2">
              <button
                className="rounded bg-emerald-500 text-white px-3 py-1"
                type="submit"
              >
                Save Roles
              </button>
              <button
                type="button"
                className="rounded bg-sky-500 text-white px-3 py-1"
                onClick={async () => {
                  setRoleSaveStatus(null);
                  try {
                    const res = await apiFetch("/api/dev/admin/role");
                    if (!res.ok)
                      return setRoleSaveStatus("Failed to load my roles");
                    const j = await res.json();
                    setMyRoles(j.roles || []);
                  } catch (e) {
                    setRoleSaveStatus(String(e));
                  }
                }}
              >
                My Roles
              </button>
              <button
                type="button"
                disabled={roleProcessing}
                className="rounded bg-rose-500 text-white px-3 py-1"
                onClick={async () => {
                  setRoleSaveStatus(null);
                  if (!rolePhone)
                    return setRoleSaveStatus("Provide phone to remove roles");
                  setRoleProcessing(true);
                  try {
                    const payload: any = { phone: rolePhone };
                    if (roleRestaurant) payload.restaurantId = roleRestaurant;
                    const res = await apiFetch("/api/dev/admin/role", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    const j = await res.json().catch(() => null);
                    if (!res.ok) {
                      setRoleSaveStatus(j?.error ?? `Status ${res.status}`);
                      return;
                    }
                    setRoleSaveStatus("Roles removed");
                    // show a confirmation alert so caller notices result
                    alert("Roles removed successfully");
                    setRolePhone("");
                    setRoleInput("");
                    setRoleRestaurant("");
                  } catch (e) {
                    setRoleSaveStatus(String(e));
                  } finally {
                    setRoleProcessing(false);
                  }
                }}
              >
                Remove Roles
              </button>
            </div>
            {roleSaveStatus ? (
              <div className="text-sm text-gray-600">{roleSaveStatus}</div>
            ) : null}
            {myRoles ? (
              <div className="text-sm text-gray-600">
                My roles: {myRoles.join(", ")}
              </div>
            ) : null}
          </form>
        </div>
      </div>

      <div className="mt-3 mb-4">
        {impersonating ? (
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600">
              Impersonating owner for:
            </div>
            <div className="font-medium">
              {selectedRestaurant?.name || impersonating}
            </div>
            <button
              className="ml-4 rounded bg-rose-500 text-white px-3 py-1"
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                setImpersonating(null);
                setSelectedRestaurant(null); /* reload global menu */
                fetch("/api/dev/admin/menu")
                  .then((r) => r.json())
                  .then((d) => setMenuItems(d.items || d || []));
              }}
            >
              Stop
            </button>
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            Not impersonating — actions will be global unless you click "Manage
            (as owner)" for a restaurant.
          </div>
        )}
      </div>

      {selectedRestaurant && (
        <div className="mb-4">
          <AdminSectionHeader>
            Managers for {selectedRestaurant.name}
          </AdminSectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <form onSubmit={addManager} className="space-y-2">
                <input
                  placeholder="Manager phone (e.g. +998901234567)"
                  value={managerPhone}
                  onChange={(e) => setManagerPhone(e.target.value)}
                  className="w-full rounded border px-2 py-1"
                />
                <div className="flex gap-2">
                  <button
                    className="rounded bg-emerald-500 text-white px-3 py-1"
                    type="submit"
                  >
                    Add Manager
                  </button>
                  <button
                    type="button"
                    className="rounded bg-gray-200 px-3 py-1"
                    onClick={() => loadManagers(selectedRestaurant.id)}
                  >
                    Refresh
                  </button>
                </div>
                {managerActionStatus ? (
                  <div className="text-sm text-gray-600">
                    {managerActionStatus}
                  </div>
                ) : null}
              </form>
            </div>
            <div className="md:col-span-2">
              <div className="space-y-2">
                <button
                  onClick={() => loadManagers(selectedRestaurant.id)}
                  className="text-sm text-blue-600"
                >
                  Load managers
                </button>
                {managers === null ? null : managers.length === 0 ? (
                  <div className="text-sm text-gray-500">No managers</div>
                ) : (
                  <div className="space-y-2">
                    {managers.map((m) => (
                      <div
                        key={m.userId}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div>
                          <div className="font-medium">
                            {m.name || m.phone || m.userId}
                          </div>
                          <div className="text-xs text-gray-500">
                            {m.phone || ""}
                          </div>
                        </div>
                        <div>
                          <button
                            className="rounded bg-red-500 text-white px-3 py-1"
                            onClick={() => void removeManager(m.userId)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <AdminSectionHeader>Restaurants</AdminSectionHeader>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <form onSubmit={saveRestaurant} className="space-y-2">
            <input
              placeholder="Name"
              value={restForm.name}
              onChange={(e) =>
                setRestForm((s) => ({ ...s, name: e.target.value }))
              }
              className="w-full rounded border px-2 py-1"
            />
            <input
              placeholder="Logo URL"
              value={restForm.logoUrl}
              onChange={(e) =>
                setRestForm((s) => ({ ...s, logoUrl: e.target.value }))
              }
              className="w-full rounded border px-2 py-1"
            />
            <input
              placeholder="Owner phone (dev only)"
              value={restForm.ownerPhone}
              onChange={(e) =>
                setRestForm((s) => ({ ...s, ownerPhone: e.target.value }))
              }
              className="w-full rounded border px-2 py-1"
            />
            <div className="flex gap-2">
              <input
                placeholder="Open (e.g. 09:00)"
                value={restForm.openTime}
                onChange={(e) =>
                  setRestForm((s) => ({ ...s, openTime: e.target.value }))
                }
                className="rounded border px-2 py-1 w-1/2"
              />
              <input
                placeholder="Close (e.g. 21:00)"
                value={restForm.closeTime}
                onChange={(e) =>
                  setRestForm((s) => ({ ...s, closeTime: e.target.value }))
                }
                className="rounded border px-2 py-1 w-1/2"
              />
            </div>
            <div className="flex gap-2">
              <button
                className="rounded bg-emerald-500 text-white px-3 py-1"
                type="submit"
              >
                Save
              </button>
            </div>
          </form>
        </div>
        <div className="md:col-span-2">
          {loading ? (
            <div>Loading...</div>
          ) : (
            <div className="space-y-2">
              {restaurants.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-2 border rounded"
                >
                  {r.logoUrl ? (
                    <img
                      src={r.logoUrl}
                      alt={r.name}
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 bg-gray-100 rounded" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-gray-500">id: {r.id}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded bg-sky-500 text-white px-3 py-1 text-sm"
                      onClick={() => router.push(`/restaurant/${r.id}`)}
                    >
                      View
                    </button>
                    <button
                      className="rounded bg-emerald-600 text-white px-3 py-1 text-sm"
                      onClick={() => {
                        localStorage.setItem(STORAGE_KEY, String(r.id));
                        setImpersonating(String(r.id));
                        fetch(
                          `/api/restaurants/${encodeURIComponent(String(r.id))}/menu`,
                        )
                          .then((res) => res.json())
                          .then((d) => setMenuItems(d.items || d || []));
                        fetch(
                          `/api/restaurants/${encodeURIComponent(String(r.id))}`,
                        )
                          .then((res) => res.json())
                          .then((d) => setSelectedRestaurant(d || null));
                      }}
                    >
                      Manage (as owner)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AdminSectionHeader>Menu Items</AdminSectionHeader>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <form onSubmit={saveMenuItem} className="space-y-2">
            <input
              placeholder="Name"
              value={menuForm.name}
              onChange={(e) =>
                setMenuForm((s) => ({ ...s, name: e.target.value }))
              }
              className="w-full rounded border px-2 py-1"
            />
            <input
              placeholder="Slug"
              value={menuForm.slug}
              onChange={(e) =>
                setMenuForm((s) => ({ ...s, slug: e.target.value }))
              }
              className="w-full rounded border px-2 py-1"
            />
            <input
              placeholder="Logo URL"
              value={menuForm.logoUrl}
              onChange={(e) =>
                setMenuForm((s) => ({ ...s, logoUrl: e.target.value }))
              }
              className="w-full rounded border px-2 py-1"
            />
            <RestaurantSelect
              value={menuForm.restaurantId}
              onChange={(v) => setMenuForm((s) => ({ ...s, restaurantId: v }))}
            />
            <input
              placeholder="Price (dev meta)"
              value={menuForm.price}
              onChange={(e) =>
                setMenuForm((s) => ({ ...s, price: e.target.value }))
              }
              className="w-full rounded border px-2 py-1"
            />
            <div className="flex gap-2">
              <button
                className="rounded bg-emerald-500 text-white px-3 py-1"
                type="submit"
              >
                Save Menu Item
              </button>
            </div>
          </form>
        </div>
        <div className="md:col-span-2">
          {loading ? (
            <div>Loading...</div>
          ) : (
            <div className="space-y-2">
              {menuItems.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 p-2 border rounded"
                >
                  {m.logoUrl ? (
                    <img
                      src={m.logoUrl}
                      alt={m.name}
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 bg-gray-100 rounded" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-gray-500">id: {m.id}</div>
                  </div>
                  <div>
                    <button
                      onClick={() => {
                        const rid =
                          impersonating ||
                          m.restaurantId ||
                          m.restaurant?.id ||
                          m.restaurantId?.toString?.();
                        if (rid)
                          router.push(
                            "/menu?restaurant=" +
                              encodeURIComponent(String(rid)),
                          );
                        else router.push("/menu");
                      }}
                      className="text-sm text-blue-600"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AdminSectionHeader>Ingredients (per menu item)</AdminSectionHeader>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <form onSubmit={saveIngredients} className="space-y-2">
            <MenuItemSelect
              value={ingForm.menuId}
              onChange={(v) => setIngForm((s) => ({ ...s, menuId: v }))}
            />
            <textarea
              placeholder="ingredients as comma-separated: name[:true|false]"
              value={ingForm.ingredientsText}
              onChange={(e) =>
                setIngForm((s) => ({ ...s, ingredientsText: e.target.value }))
              }
              className="w-full rounded border px-2 py-1"
            />
            <div className="flex gap-2">
              <button
                className="rounded bg-emerald-500 text-white px-3 py-1"
                type="submit"
              >
                Save Ingredients
              </button>
            </div>
          </form>
        </div>
        <div className="md:col-span-2">
          <div className="text-sm text-gray-500 mb-2">
            Ingredients are created/replaced via the existing{" "}
            <code>{"/api/menu/{id}/ingredients"}</code> endpoint.
          </div>
          {loadingIngredients ? (
            <div>Loading ingredients...</div>
          ) : ingForm.menuId ? (
            ingredients.length === 0 ? (
              <div className="text-sm text-gray-500">
                No ingredients found for selected menu item.
              </div>
            ) : (
              <ul className="space-y-2">
                {ingredients.map((ing: any) => (
                  <li
                    key={ing.id}
                    className="p-2 border rounded flex justify-between items-center"
                  >
                    <div>
                      <div className="font-medium">{ing.name}</div>
                      <div className="text-xs text-gray-500">
                        {ing.mandatory ? "mandatory" : "optional"}
                      </div>
                    </div>

                    <div className="ml-3 flex items-center gap-2">
                      {canEditIngredients ? (
                        <button
                          className="px-2 py-1 bg-red-500 text-white rounded"
                          onClick={() => void handleDeleteIngredient(ing.id)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="text-sm text-gray-500">
              Select a menu item to view its ingredients.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
