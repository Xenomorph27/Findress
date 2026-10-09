"use client";

import { useCallback, useState } from "react";

/**
 * Ends the session and lands on /login with a full navigation, so no client cache (bookmarks,
 * owner state, prefetched pages) survives the logout.
 */
export function useLogout() {
  const [pending, setPending] = useState(false);
  const logout = useCallback(async () => {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so no client cache survives logout
      window.location.assign("/login");
    }
  }, []);
  return { logout, pending };
}
