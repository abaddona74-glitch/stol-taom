"use client";
import React from "react";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";

export default function RestaurantManagementPage() {
  const router = useRouter();
  const params = useParams() as { id?: string };
  const restaurantId = params?.id || "";

  const [status, setStatus] = React.useState<
    "loading" | "not-auth" | "checking" | "allowed" | "denied"
  >("loading");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [openOrders, setOpenOrders] = React.useState<any[] | null>(null);
  const [showRaw, setShowRaw] = React.useState(false);
  const [menuItems, setMenuItems] = React.useState<any[] | null>(null);
  const [showMenu, setShowMenu] = React.useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = React.useState<any | null>(null);
  const [menuItemIngredients, setMenuItemIngredients] = React.useState<any[] | null>(null);
  const [restaurantName, setRestaurantName] = React.useState<string>("");
  const [showManagers, setShowManagers] = React.useState(false);
  const [managers, setManagers] = React.useState<any[] | null>(null);
  const [newManagerPhone, setNewManagerPhone] = React.useState("");
  const [managerMessage, setManagerMessage] = React.useState<string | null>(null);
  const [editingMenuItem, setEditingMenuItem] = React.useState<any | null>(null);
  const [menuFormData, setMenuFormData] = React.useState({ name: "", slug: "", logoUrl: "", description: "", price: "" });
  const [menuError, setMenuError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    async function init() {
      if (!restaurantId) return;
      setStatus("checking");

      // Load restaurant name
      try {
        const restRes = await fetch(`/api/restaurants/${restaurantId}`);
        if (restRes.ok) {
          const restData = await restRes.json();
          if (mounted) setRestaurantName(restData.name || "");
        }
      } catch (e) {
        // ignore error, keep empty name
      }
      // Fast path: try fetching orders directly (works if cookies/access token valid)
      try {
        const direct = await apiFetch(
          `/api/management/orders?restaurantId=${encodeURIComponent(restaurantId)}`,
        );
        if (!mounted) return;
        if (direct.ok) {
          const dj = await direct.json();
          setOpenOrders(dj.items || []);
          setStatus("allowed");
          return;
        }
      } catch (e) {
        // ignore and fall back to explicit check
      }

      // Fallback: explicit manager check then fetch (allows refresh flow)
      try {
        const res = await fetch(
          `/api/management/check?restaurantId=${encodeURIComponent(restaurantId)}`,
          { credentials: "same-origin" },
        );
        if (!mounted) return;
        const j = await res.json().catch(() => null);
        if (j?.allowed) {
          setStatus("allowed");
          try {
            const or = await apiFetch(
              `/api/management/orders?restaurantId=${encodeURIComponent(restaurantId)}`,
            );
            if (!mounted) return;
            if (!or.ok) {
              const oj = await or.json().catch(() => null);
              setMessage(oj?.error || `Status ${or.status}`);
              setOpenOrders([]);
            } else {
              const oj = await or.json();
              if (!mounted) return;
              setOpenOrders(oj.items || []);
            }
          } catch (err) {
            if (!mounted) return;
            setMessage(String(err));
            setOpenOrders([]);
          }
        } else {
          setStatus("not-auth");
        }
      } catch (e) {
        setStatus("not-auth");
      }
    }
    void init();
    return () => {
      mounted = false;
    };
  }, [restaurantId]);

  async function loadMenuItems() {
    if (!restaurantId) return;
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/menu`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setMenuItems(data.items || []);
    } catch (err) {
      setMessage(String(err));
      setMenuItems([]);
    }
  }

  async function loadManagers() {
    if (!restaurantId) return;
    try {
      const res = await apiFetch(`/api/dev/admin/managers?restaurantId=${restaurantId}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setManagers(data.items || []);
    } catch (err) {
      setManagerMessage(String(err));
      setManagers([]);
    }
  }

  async function addManager(e: React.FormEvent) {
    e.preventDefault();
    if (!newManagerPhone.trim()) return;
    setManagerMessage(null);
    try {
      const res = await apiFetch('/api/dev/admin/managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, phone: newManagerPhone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setManagerMessage(data.error || `Status ${res.status}`);
        return;
      }
      setManagerMessage(data.tempPassword ? `Manager added! Temp password: ${data.tempPassword}` : 'Manager added successfully!');
      setNewManagerPhone('');
      loadManagers();
    } catch (err) {
      setManagerMessage(String(err));
    }
  }

  async function removeManager(userId: string) {
    if (!confirm('Remove this manager?')) return;
    setManagerMessage(null);
    try {
      const res = await apiFetch('/api/dev/admin/managers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setManagerMessage(data.error || `Status ${res.status}`);
        return;
      }
      setManagerMessage('Manager removed successfully!');
      loadManagers();
    } catch (err) {
      setManagerMessage(String(err));
    }
  }

  async function createMenuItem(e: React.FormEvent) {
    e.preventDefault();
    setMenuError(null);
    if (!menuFormData.name || !menuFormData.slug) {
      setMenuError('Name and slug are required');
      return;
    }
    try {
      const res = await apiFetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(menuFormData),
      });
      if (!res.ok) {
        const data = await res.json();
        setMenuError(data.error || `Status ${res.status}`);
        return;
      }
      const data = await res.json();
      // Assign to restaurant with price
      const assignRes = await apiFetch(`/api/menu/${data.item.id}/restaurants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantIds: [restaurantId],
          priceOverride: menuFormData.price || null
        }),
      });
      if (!assignRes.ok) {
        const assignData = await assignRes.json();
        setMenuError(`Created but assignment failed: ${assignData.error || assignRes.status}`);
        return;
      }
      setMenuError('Menu item created successfully!');
      setMenuFormData({ name: '', slug: '', logoUrl: '', description: '', price: '' });
      loadMenuItems();
    } catch (err) {
      setMenuError(String(err));
    }
  }

  async function updateMenuItem(e: React.FormEvent) {
    e.preventDefault();
    setMenuError(null);
    if (!editingMenuItem) return;
    try {
      const res = await apiFetch(`/api/menu/${editingMenuItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(menuFormData),
      });
      if (!res.ok) {
        const data = await res.json();
        setMenuError(data.error || `Status ${res.status}`);
        return;
      }

      // Also update the price in MenuItemOnRestaurant if price changed
      if (menuFormData.price !== undefined) {
        const priceRes = await apiFetch(`/api/menu/${editingMenuItem.id}/restaurants`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantIds: [restaurantId],
            priceOverride: menuFormData.price || null
          }),
        });
        if (!priceRes.ok) {
          const priceData = await priceRes.json();
          setMenuError(`Updated item but price update failed: ${priceData.error || priceRes.status}`);
          loadMenuItems();
          return;
        }
      }

      setMenuError('Menu item updated successfully!');
      setEditingMenuItem(null);
      setMenuFormData({ name: '', slug: '', logoUrl: '', description: '', price: '' });
      loadMenuItems();
    } catch (err) {
      setMenuError(String(err));
    }
  }

  async function deleteMenuItem(id: string) {
    if (!confirm('Are you sure you want to delete this menu item?')) return;
    setMenuError(null);
    try {
      const res = await apiFetch(`/api/menu/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        setMenuError(data.error || `Status ${res.status}`);
        return;
      }
      setMenuError('Menu item deleted successfully!');
      loadMenuItems();
    } catch (err) {
      setMenuError(String(err));
    }
  }

  function startEditMenuItem(item: any) {
    setEditingMenuItem(item);
    setMenuFormData({
      name: item.name || '',
      slug: item.slug || '',
      logoUrl: item.logoUrl || '',
      description: item.description || '',
      price: item.priceOverride || '',
    });
    setMenuError(null);
  }

  function cancelEditMenuItem() {
    setEditingMenuItem(null);
    setMenuFormData({ name: '', slug: '', logoUrl: '', description: '', price: '' });
    setMenuError(null);
  }

  async function loadMenuItemDetails(menuItemId: string) {
    try {
      const [detailRes, ingredientsRes] = await Promise.all([
        fetch(`/api/menu/${menuItemId}`),
        fetch(`/api/menu/${menuItemId}/ingredients`)
      ]);
      const detail = await detailRes.json();
      const ingredients = await ingredientsRes.json();
      setSelectedMenuItem(detail);
      setMenuItemIngredients(ingredients.items || []);
    } catch (err) {
      setMessage(String(err));
    }
  }

  async function doLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setMessage(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone, password }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) return setMessage(j?.error || `Login failed: ${res.status}`);
      // after successful login, re-check manager access
      const check = await fetch(
        `/api/management/check?restaurantId=${encodeURIComponent(restaurantId)}`,
        { credentials: "same-origin" },
      );
      const cj = await check.json().catch(() => null);
      if (cj?.allowed) setStatus("allowed");
      else setStatus("denied");
    } catch (err) {
      setMessage(String(err));
    }
  }

  // Accordion component for a client group — defined in component scope (before return)
  function ClientAccordion({ label, items }: { label: string; items: any[] }) {
    const [open, setOpen] = React.useState(false);
    // show most recent createdAt for group
    const latest = React.useMemo(() => {
      let ts = 0;
      for (const it of items) {
        const t = it.createdAt ? new Date(it.createdAt).getTime() : 0;
        if (t > ts) ts = t;
      }
      return ts ? new Date(ts).toLocaleString() : "";
    }, [items]);

    return (
      <div className="border rounded overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900"
        >
          <div className="text-left">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {label}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {items.length} item{items.length !== 1 ? "s" : ""} — {latest}
            </div>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {open ? "▾" : "▸"}
          </div>
        </button>
        {open ? (
          <div className="p-3 space-y-2 bg-white dark:bg-gray-800">
            {items.map((o) => (
              <div key={o.id} className="p-2 border rounded">
                <div className="flex justify-between">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {o.type === "order"
                      ? `Order — ${o.status ?? "—"}`
                      : `Reservation — Party: ${o.partySize ?? "—"}`}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {o.createdAt ? new Date(o.createdAt).toLocaleString() : ""}
                  </div>
                </div>
                {o.type === "order" ? (
                  <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      Payment: {o.paymentMethod ?? "—"}
                    </div>
                    <div className="mt-2 space-y-1">
                      {Array.isArray(o.items) && o.items.length > 0 ? (
                        o.items.map((it: any) => (
                          <div
                            key={it.id}
                            className="flex justify-between text-sm text-gray-800 dark:text-gray-200"
                          >
                            <div>
                              {it.name} x{it.quantity}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {it.price != null ? `${it.price}` : ""}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">No items</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                      From:{" "}
                      {o.fromDate ? new Date(o.fromDate).toLocaleString() : "—"}
                      {o.toDate
                        ? ` — ${new Date(o.toDate).toLocaleString()}`
                        : ""}
                    </div>
                    {o.note ? (
                      <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                        Note: {o.note}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (!restaurantId) return <div className="p-6">Restaurant id missing</div>;

  return (
    <main className="p-6 mx-auto max-w-3xl">
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => router.push("/management")}
          className="rounded border px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Back to restaurants"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold">
          Management — {restaurantName || restaurantId}
        </h1>
      </div>
      {status === "loading" || status === "checking" ? (
        <div>Checking access...</div>
      ) : null}

      {status === "not-auth" && (
        <div>
          <p className="mb-3">
            You must sign in as a manager for this restaurant.
          </p>
          <form onSubmit={doLogin} className="space-y-2">
            <input
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border px-2 py-1"
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border px-2 py-1"
            />
            <div className="flex gap-2">
              <button
                className="rounded bg-emerald-500 text-white px-3 py-1"
                type="submit"
              >
                Sign in
              </button>
              <button
                type="button"
                className="rounded bg-gray-200 dark:bg-gray-700 px-3 py-1 text-gray-800 dark:text-gray-100"
                onClick={() => router.push("/management")}
              >
                Back
              </button>
            </div>
            {message ? (
              <div className="text-sm text-red-600 mt-2">{message}</div>
            ) : null}
          </form>
        </div>
      )}

      {status === "denied" && (
        <div className="text-red-600">
          Access denied. You are signed in but not a manager for this
          restaurant.
        </div>
      )}

      {status === "allowed" && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Manager Dashboard</h2>
          <p className="text-sm text-gray-600 mb-4">
            You can now manage this restaurant (placeholder UI).
          </p>
          <div className="space-y-2">
            <div className="flex gap-2 items-start">
              <button
                className="rounded bg-sky-500 text-white px-3 py-1"
                onClick={async () => {
                  setMessage(null);
                  setStatus("checking");
                  try {
                    const res = await apiFetch(
                      `/api/management/orders?restaurantId=${encodeURIComponent(restaurantId)}`,
                    );
                    if (!res.ok) {
                      const j = await res.json().catch(() => null);
                      setMessage(j?.error || `Status ${res.status}`);
                      setStatus("allowed");
                      return;
                    }
                    const j = await res.json();
                    setStatus("allowed");
                    setOpenOrders(j.items || []);
                  } catch (e) {
                    setMessage(String(e));
                    setStatus("allowed");
                  }
                }}
              >
                Open Orders
              </button>
              <div>
                <small className="text-xs text-gray-500">
                  Click to load reservations (open orders)
                </small>
                {message ? (
                  <div className="text-sm text-red-600">{message}</div>
                ) : null}
              </div>
            </div>
            <button
              className="rounded bg-emerald-600 text-white px-3 py-1 hover:bg-emerald-700 transition-colors"
              onClick={() => {
                setShowMenu(true);
                if (!menuItems) loadMenuItems();
              }}
            >
              Edit Menu
            </button>
            <button
              className="rounded bg-purple-600 text-white px-3 py-1 hover:bg-purple-700 transition-colors"
              onClick={() => {
                setShowManagers(true);
                if (!managers) loadManagers();
              }}
            >
              Manage Managers
            </button>
            <button
              type="button"
              className="rounded bg-gray-200 dark:bg-gray-700 px-3 py-1 text-sm text-gray-800 dark:text-gray-100"
              onClick={() => setShowRaw((s) => !s)}
            >
              {showRaw ? "Hide raw" : "Show raw"}
            </button>
          </div>
        </div>
      )}
      {showRaw && (
        <div className="mt-4 p-3 border rounded bg-white dark:bg-gray-900">
          <div className="text-sm font-medium mb-2">Raw openOrders JSON</div>
          <pre className="text-xs overflow-auto max-h-64">
            {JSON.stringify(openOrders, null, 2)}
          </pre>
        </div>
      )}
      {openOrders && openOrders.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">
            Open Orders / Reservations (grouped by client)
          </h3>
          <div className="space-y-2">
            {/* Group orders by user id / phone (robust - falls back to ungrouped list on error) */}
            {(() => {
              try {
                const groups: Array<{
                  key: string;
                  label: string;
                  items: any[];
                }> = [];
                const map = new Map<
                  string,
                  { key: string; label: string; items: any[] }
                >();
                if (!Array.isArray(openOrders))
                  throw new Error("openOrders is not an array");
                for (const o of openOrders) {
                  const uid =
                    (o && o.user && (o.user.id || o.user.phone)) || "guest";
                  const label =
                    (o && o.user && (o.user.name || o.user.phone)) || "Guest";
                  if (!map.has(uid))
                    map.set(uid, { key: uid, label, items: [] });
                  map.get(uid)!.items.push(o);
                }
                for (const v of map.values()) groups.push(v);
                if (groups.length === 0)
                  return (
                    <div className="text-sm text-gray-500">
                      No open orders found.
                    </div>
                  );
                return groups.map((g) => (
                  <ClientAccordion
                    key={g.key}
                    label={g.label}
                    items={g.items}
                  />
                ));
              } catch (err) {
                // If grouping fails for any reason, show a simple fallback list and surface the error message
                return (
                  <div className="space-y-2">
                    <div className="text-sm text-red-600">
                      Failed to group orders: {(err as Error).message}
                    </div>
                    {Array.isArray(openOrders) ? (
                      openOrders.map((o) => (
                        <div
                          key={o.id ?? Math.random()}
                          className="p-2 border rounded"
                        >
                          <div className="font-medium">
                            {o.type === "order"
                              ? `Order — ${o.status ?? "—"}`
                              : `Reservation — ${o.partySize ?? "—"}`}
                          </div>
                          <div className="text-xs text-gray-600">
                            {o.createdAt ?? ""}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500">
                        No open orders.
                      </div>
                    )}
                  </div>
                );
              }
            })()}
          </div>
        </div>
      )}

      {/* Managers Section */}
      {showManagers && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowManagers(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b p-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Restaurant Managers</h2>
              <button onClick={() => setShowManagers(false)} className="text-2xl hover:text-red-600">&times;</button>
            </div>
            <div className="p-6">
              {/* Add Manager Form */}
              <form onSubmit={addManager} className="mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                <h3 className="text-lg font-semibold mb-3">Add New Manager</h3>
                <div className="flex gap-2">
                </div>
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Phone number"
                    value={newManagerPhone}
                    onChange={(e) => setNewManagerPhone(e.target.value)}
                    className="flex-1 rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-700"
                  />
                  <button
                    type="submit"
                    className="rounded bg-purple-600 text-white px-4 py-2 hover:bg-purple-700 transition-colors"
                  >
                    Add Manager
                  </button>
                </div>
                {managerMessage && (
                  <div className={`mt-2 text-sm ${managerMessage.includes('successfully') || managerMessage.includes('added') ? 'text-green-600' : 'text-red-600'}`}>
                    {managerMessage}
                  </div>
                )}
              </form>

              {/* Managers List */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Current Managers</h3>
                {managers === null ? (
                  <div className="text-center py-4">Loading managers...</div>
                ) : managers.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">No managers found</div>
                ) : (
                  <div className="space-y-2">
                    {managers.map((mgr) => (
                      <div key={mgr.userId} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <div>
                          <div className="font-semibold">{mgr.name || 'No name'}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">{mgr.phone}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-500">
                            Added: {mgr.createdAt ? new Date(mgr.createdAt).toLocaleDateString() : 'Unknown'}
                          </div>
                        </div>
                        <button
                          onClick={() => removeManager(mgr.userId)}
                          className="rounded bg-red-500 text-white px-3 py-1 hover:bg-red-600 transition-colors text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Menu Items Section */}
      {showMenu && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowMenu(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-6xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b p-4 flex justify-between items-center z-10">
              <h2 className="text-2xl font-bold">Restaurant Menu</h2>
              <button onClick={() => setShowMenu(false)} className="text-2xl hover:text-red-600">&times;</button>
            </div>
            <div className="p-6">
              {/* Create/Edit Form */}
              <form onSubmit={editingMenuItem ? updateMenuItem : createMenuItem} className="mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                <h3 className="text-lg font-semibold mb-3">{editingMenuItem ? 'Edit Menu Item' : 'Add New Menu Item'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Name *"
                    value={menuFormData.name}
                    onChange={(e) => setMenuFormData({ ...menuFormData, name: e.target.value })}
                    className="rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-700"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Slug (unique) *"
                    value={menuFormData.slug}
                    onChange={(e) => setMenuFormData({ ...menuFormData, slug: e.target.value })}
                    className="rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-700"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Logo URL"
                    value={menuFormData.logoUrl}
                    onChange={(e) => setMenuFormData({ ...menuFormData, logoUrl: e.target.value })}
                    className="rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-700"
                  />
                  <input
                    type="text"
                    placeholder="Price in UZS (e.g., 25000)"
                    value={menuFormData.price}
                    onChange={(e) => setMenuFormData({ ...menuFormData, price: e.target.value })}
                    className="rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>
                <div className="col-span-full">
                  <textarea
                    placeholder="Description"
                    value={menuFormData.description}
                    onChange={(e) => setMenuFormData({ ...menuFormData, description: e.target.value })}
                    className="w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-700"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    type="submit"
                    className="rounded bg-emerald-600 text-white px-4 py-2 hover:bg-emerald-700 transition-colors"
                  >
                    {editingMenuItem ? 'Update' : 'Create'}
                  </button>
                  {editingMenuItem && (
                    <button
                      type="button"
                      onClick={cancelEditMenuItem}
                      className="rounded bg-gray-500 text-white px-4 py-2 hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {menuError && (
                  <div className={`mt-2 text-sm ${menuError.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                    {menuError}
                  </div>
                )}
              </form>

              {menuItems === null ? (
                <div className="text-center py-8">Loading menu...</div>
              ) : menuItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No menu items found</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {menuItems.map((item) => (
                    <div key={item.id} className="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                      <div className="relative h-48 bg-gray-200 dark:bg-gray-700 cursor-pointer" onClick={() => loadMenuItemDetails(item.id)}>
                        {item.logoUrl ? (
                          <img src={item.logoUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex items-center justify-center h-full text-4xl font-bold text-gray-400">
                            {item.name?.charAt(0) || "M"}
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-lg mb-1">{item.name}</h3>
                        <p className="text-xs text-gray-500 mb-1">{item.slug || "No slug"}</p>
                        {item.priceOverride && (
                          <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                            Price: {item.priceOverride}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEditMenuItem(item)}
                            className="flex-1 rounded bg-blue-600 text-white px-3 py-1 text-sm hover:bg-blue-700 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteMenuItem(item.id)}
                            className="flex-1 rounded bg-red-600 text-white px-3 py-1 text-sm hover:bg-red-700 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Menu Item Detail Modal */}
      {selectedMenuItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-60 p-4" onClick={() => { setSelectedMenuItem(null); setMenuItemIngredients(null); }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b p-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold">{selectedMenuItem.name}</h2>
              <button onClick={() => { setSelectedMenuItem(null); setMenuItemIngredients(null); }} className="text-2xl hover:text-red-600">&times;</button>
            </div>
            <div className="p-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="relative h-64 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden mb-4">
                    {selectedMenuItem.imageUrl || selectedMenuItem.logoUrl ? (
                      <img src={selectedMenuItem.imageUrl || selectedMenuItem.logoUrl} alt={selectedMenuItem.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-6xl font-bold text-gray-400">
                        {selectedMenuItem.name?.charAt(0) || "M"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div><span className="font-semibold">Slug:</span> {selectedMenuItem.slug || "—"}</div>
                    <div><span className="font-semibold">Description:</span></div>
                    <p className="text-gray-700 dark:text-gray-300">{selectedMenuItem.description || "No description available"}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-4">Ingredients</h3>
                  {menuItemIngredients === null ? (
                    <div className="text-center py-4">Loading ingredients...</div>
                  ) : menuItemIngredients.length === 0 ? (
                    <div className="text-gray-500">No ingredients found</div>
                  ) : (
                    <div className="space-y-3">
                      {menuItemIngredients.map((ing) => (
                        <div key={ing.id} className="flex gap-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                          <div className="w-16 h-16 shrink-0 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                            {ing.logoUrl ? (
                              <img src={ing.logoUrl} alt={ing.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="flex items-center justify-center h-full text-xl font-bold text-gray-400">
                                {ing.name?.charAt(0) || "I"}
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold">{ing.name}</div>
                            <div className="text-xs text-gray-500">{ing.slug || ""}</div>
                            {ing.description && (
                              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{ing.description}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Accordion component for a client group (defined above) */}
    </main>
  );
}
