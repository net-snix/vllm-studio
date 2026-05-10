"use client";

import { useState, type ReactNode } from "react";
import { LoaderCircle, Power, TriangleAlert, X } from "lucide-react";
import { Button, UiModal, UiModalHeader } from "@/components/ui-kit";

type ShutdownTriggerArgs = {
  open: () => void;
  shuttingDown: boolean;
};

type ShutdownHostConfirmProps = {
  trigger: (args: ShutdownTriggerArgs) => ReactNode;
  onShutdown: () => Promise<void> | void;
};

export function ShutdownHostConfirm({
  trigger,
  onShutdown,
}: ShutdownHostConfirmProps) {
  const [open, setOpen] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmShutdown = async () => {
    setShuttingDown(true);
    setError(null);
    try {
      await onShutdown();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setShuttingDown(false);
    }
  };

  return (
    <>
      {trigger({
        open: () => {
          setError(null);
          setOpen(true);
        },
        shuttingDown,
      })}
      <UiModal
        isOpen={open}
        onClose={() => !shuttingDown && setOpen(false)}
        maxWidth="max-w-md"
      >
        <UiModalHeader
          title="Shut down host?"
          icon={
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-(--err)/30 bg-(--err)/10">
              <Power className="h-4 w-4 text-(--err)" />
            </span>
          }
          onClose={() => !shuttingDown && setOpen(false)}
          closeIcon={<X className="h-4 w-4" />}
          className="border-(--err)/20 bg-(--err)/[0.03]"
        />
        <div className="space-y-5 px-6 py-5">
          <div className="rounded-xl border border-(--border)/70 bg-(--bg)/60 p-4">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-(--err)" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-(--fg)">
                  The host machine will power off now.
                </p>
                <p className="text-sm leading-6 text-(--dim)">
                  Running models, chats, and dashboard telemetry will stop when
                  the shutdown command is accepted.
                </p>
              </div>
            </div>
          </div>
          {error ? (
            <div className="rounded-lg border border-(--err)/40 bg-(--err)/10 px-3 py-2 text-sm text-(--err)">
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={shuttingDown}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmShutdown}
              disabled={shuttingDown}
            >
              {shuttingDown ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {shuttingDown ? "Shutting down..." : "Shut down"}
            </Button>
          </div>
        </div>
      </UiModal>
    </>
  );
}
