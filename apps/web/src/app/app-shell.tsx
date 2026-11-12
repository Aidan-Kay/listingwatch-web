import { Bell, Heart, ListChecks, Pause, Play, Search, Settings } from "lucide-react";
import type { ComponentType } from "react";
import { NavLink, Outlet } from "react-router";
import { usePolling, useSearches, useSetPaused } from "@/api/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveConnection, type ConnectionState } from "@/live/use-live-connection";
import { cn } from "@/lib/utils";
import { useAppEffects } from "./use-app-effects";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { to: "/", label: "Feed", icon: Bell },
  { to: "/searches", label: "Searches", icon: Search },
  { to: "/lists", label: "Match lists", icon: ListChecks },
  { to: "/favourites", label: "Favourites", icon: Heart },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const connection = useLiveConnection();
  const { unseen } = useAppEffects();
  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col border-r bg-sidebar p-3 md:flex">
        <div className="mb-4 flex items-center gap-2 px-2 pt-1">
          <img src="/icons/icon-192.png" alt="" className="size-7 rounded-md" />
          <span className="font-semibold tracking-tight">ListingWatch</span>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {NAV.map((item) => (
            <SidebarLink key={item.to} item={item} count={item.to === "/" ? unseen : 0} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <PollingStatus connection={connection} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background/85 px-4 py-2 backdrop-blur md:hidden">
          <img src="/icons/icon-192.png" alt="" className="size-6 rounded" />
          <span className="font-semibold">ListingWatch</span>
          <div className="ml-auto">
            <PollingStatus connection={connection} compact />
          </div>
        </header>
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Main"
      >
        {NAV.map((item) => (
          <BottomLink key={item.to} item={item} count={item.to === "/" ? unseen : 0} />
        ))}
      </nav>
    </div>
  );
}

function SidebarLink({ item, count }: { item: NavItem; count: number }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
          isActive && "bg-sidebar-accent font-medium text-sidebar-foreground",
        )
      }
    >
      <Icon className="size-4" />
      {item.label}
      {count > 0 && <Badge className="ml-auto h-5 min-w-5 px-1.5 tabular-nums">{count > 99 ? "99+" : count}</Badge>}
    </NavLink>
  );
}

function BottomLink({ item, count }: { item: NavItem; count: number }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn("relative flex flex-col items-center gap-0.5 py-2 text-[0.7rem] text-muted-foreground", isActive && "text-foreground")
      }
    >
      <Icon className="size-5" />
      <span className="truncate">{item.label.replace("Match lists", "Lists")}</span>
      {count > 0 && (
        <span className="absolute top-1 left-1/2 ml-2 min-w-4 rounded-full bg-primary px-1 text-[0.65rem] leading-4 font-medium text-primary-foreground tabular-nums">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </NavLink>
  );
}

/** Whether polling is running (and live updates connected), with the global pause switch. */
function PollingStatus({ connection, compact = false }: { connection: ConnectionState; compact?: boolean }) {
  const polling = usePolling();
  const searches = useSearches();
  const setPaused = useSetPaused();
  const paused = polling.data?.paused ?? false;
  const active = searches.data?.filter((s) => s.enabled).length ?? 0;
  const failing = searches.data?.filter((s) => s.enabled && s.status.lastError).length ?? 0;
  const status =
    connection !== "live"
      ? { dot: "bg-amber-500", text: "Reconnecting…" }
      : paused
        ? { dot: "bg-muted-foreground", text: "Paused" }
        : active === 0
          ? { dot: "bg-muted-foreground", text: "No active searches" }
          : failing > 0
            ? { dot: "bg-amber-500", text: `${failing} of ${active} failing` }
            : { dot: "bg-emerald-500 animate-pulse", text: `Watching ${active}` };
  const button = (
    <Button
      variant={compact ? "ghost" : "outline"}
      size={compact ? "icon-sm" : "sm"}
      className={compact ? "" : "w-full justify-start"}
      disabled={polling.isLoading || setPaused.isPending}
      onClick={() => setPaused.mutate(!paused)}
      aria-label={paused ? "Resume polling" : "Pause polling"}
    >
      {paused ? <Play /> : <Pause />}
      {!compact && (paused ? "Resume all" : "Pause all")}
    </Button>
  );
  return (
    <div className={cn("flex items-center gap-2", !compact && "flex-col items-stretch")}>
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground" role="status">
        <span className={cn("size-2 rounded-full", status.dot)} aria-hidden />
        {status.text}
      </div>
      {compact ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{paused ? "Resume polling" : "Pause polling"}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </div>
  );
}
