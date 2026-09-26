"use client";

import { Clock } from "lucide-react";
import type { Ref } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fillTemplate, formatQuotaTime } from "@/lib/i18n/format";

/** StyleGuide §7.4: two ways out, waiting or a personal key; the chosen file stays in place. */
export function DailyQuotaNotice({
  resetsAt,
  onUseOwnKey,
  ref,
}: {
  resetsAt: string;
  onUseOwnKey: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  const { t, language } = useI18n();
  return (
    <Alert
      ref={ref}
      tone="advisory"
      icon={Clock}
      title={t.quota.dailyTitle}
      actions={
        <Button variant="secondary" onClick={onUseOwnKey}>
          {t.actions.useOwnKey}
        </Button>
      }
    >
      <p>{fillTemplate(t.quota.dailyBody, { time: formatQuotaTime(resetsAt, language, t.quotaTime) })}</p>
    </Alert>
  );
}

/** StyleGuide §7.5: no personal-key action, because a personal key does not lift this limit. */
export function HourlyLimitNotice({ resetsAt, ref }: { resetsAt: string; ref?: Ref<HTMLDivElement> }) {
  const { t, language } = useI18n();
  return (
    <Alert ref={ref} tone="advisory" icon={Clock} title={t.quota.hourlyTitle}>
      <p>{fillTemplate(t.quota.hourlyBody, { time: formatQuotaTime(resetsAt, language, t.quotaTime) })}</p>
    </Alert>
  );
}
