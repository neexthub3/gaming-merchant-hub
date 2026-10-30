import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Full error text on screen with a Copy button, so it can be pasted to support. */
export function ErrorDetails({
  title,
  detail,
  onClose,
}: {
  title: string;
  detail: string;
  onClose?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = `${title}\n\n${detail}\n\nTime: ${new Date().toISOString()}`;
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{title}</p>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "কপি হয়েছে" : "কপি করুন"}
          </Button>
          {onClose && (
            <Button type="button" variant="ghost" size="icon" aria-label="বন্ধ করুন" onClick={onClose}>
              <X />
            </Button>
          )}
        </div>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-background/60 p-3 font-mono text-xs">
        {detail}
      </pre>
    </div>
  );
}

export const errorText = (e: unknown) =>
  e instanceof Error ? `${e.name}: ${e.message}` : typeof e === "string" ? e : JSON.stringify(e);
