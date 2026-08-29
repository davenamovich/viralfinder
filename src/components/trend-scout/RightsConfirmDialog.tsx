"use client";

import { useScoutStore } from "@/lib/trend-scout/store";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ShieldAlert } from "lucide-react";

export function RightsConfirmDialog() {
  const state = useScoutStore((s) => s.rightsConfirm);
  const close = useScoutStore((s) => s.closeRightsConfirm);

  return (
    <AlertDialog open={state.open} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent className="bg-card border-[var(--pr-gold)]/25 pr-glow-gold">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[var(--pr-gold)]" />
            Confirm rights before sending
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            This source is marked <strong className="text-amber-300">Rights unverified</strong>. Trend
            Scout will not auto-send it into <code className="text-[var(--pr-electric)]">/clip</code> or{" "}
            <code className="text-[var(--pr-electric)]">/rebuild</code>.
            <br />
            <br />
            By continuing, you confirm that you own this video or have explicit permission to adapt
            and publish it. You are responsible for the rights clearance — the P&R pipeline will not
            retry, and Trend Scout will not download, publish, or process the media automatically.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              state.onConfirm?.();
              close();
            }}
            className="bg-[var(--pr-gold)] text-[#1a0e00] hover:bg-[var(--pr-gold)]/90"
          >
            I confirm I own or have permission
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
