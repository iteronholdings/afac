import { ParticipationStatus, STATUS_SHORT, WORKFLOW_STEPS, statusIndex } from "@/lib/workflow";
import { Check } from "lucide-react";

export default function WorkflowStepper({ status }: { status: ParticipationStatus }) {
  if (status === "rejected") {
    return (
      <div className="rounded-xl bg-rose-50 px-3 py-2 text-center text-sm font-medium text-rose-700">
        반려된 참여입니다. 관리자에게 문의해 주세요.
      </div>
    );
  }

  const current = statusIndex(status);

  return (
    <div className="flex items-center">
      {WORKFLOW_STEPS.map((step, idx) => {
        const done = idx < current;
        const active = idx === current;
        return (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "bg-primary/15 text-primary ring-2 ring-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </div>
              <span
                className={`whitespace-nowrap text-[11px] ${
                  active ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {STATUS_SHORT[step]}
              </span>
            </div>
            {idx < WORKFLOW_STEPS.length - 1 && (
              <div
                className={`mx-1 h-0.5 flex-1 rounded-full transition-colors ${
                  idx < current ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
