import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLE_LABEL, type Role } from "../lib/types";
import { cx } from "../lib/format";

const ROLE_CHIP: Record<Role, string> = {
  customer: "bg-sky-100 text-sky-800",
  support_agent: "bg-violet-100 text-violet-800",
  admin: "bg-rose-100 text-rose-800",
};

function navFor(role: Role): Array<{ to: string; label: string }> {
  if (role === "customer") {
    return [
      { to: "/tickets", label: "My tickets" },
      { to: "/tickets/new", label: "New ticket" },
    ];
  }
  if (role === "support_agent") {
    return [
      { to: "/tickets", label: "My tickets" },
      { to: "/queue", label: "Queue" },
      { to: "/dashboard", label: "Dashboard" },
    ];
  }
  return [
    { to: "/tickets", label: "All tickets" },
    { to: "/queue", label: "Queue" },
    { to: "/dashboard", label: "Dashboard" },
    { to: "/agents", label: "Agents" },
  ];
}

export function AppLayout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to="/tickets" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              SD
            </span>
            <span className="hidden sm:inline">SupportDesk</span>
          </Link>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {navFor(user.role).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/tickets"}
                className={({ isActive }) =>
                  cx(
                    "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight text-slate-800">{user.fullName}</div>
              <div
                className={cx(
                  "mt-0.5 inline-block rounded-full px-2 py-px text-[11px] font-medium",
                  ROLE_CHIP[user.role]
                )}
              >
                {ROLE_LABEL[user.role]}
              </div>
            </div>
            <button
              onClick={logout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4">
        <p className="text-center text-xs text-slate-400">
          SupportDesk · demo helpdesk for customers, agents and admins
        </p>
      </footer>
    </div>
  );
}
