import { useRouteError } from "react-router";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";

/** Shown when a page crashes, instead of a blank screen. */
export function RouteError() {
  const error = useRouteError();
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">{errorMessage(error)}</p>
      <Button onClick={() => window.location.assign("/")}>Reload ListingWatch</Button>
    </div>
  );
}
