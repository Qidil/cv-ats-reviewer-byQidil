"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { DrawablyCard } from "@/lib/drawably";
import { cn } from "@/lib/cn";
import { fillTemplate } from "@/lib/i18n/format";
import { EASE_OUT } from "@/components/results/status";
import { SUGGESTED_JOB_COUNT, type SuggestedJob } from "@/types/ats";

/** PRD §6.2: title, fit, and reason at a glance; the skills open on click (animated since Phase 10). */
function JobCard({ job }: { job: SuggestedJob }) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion() === true;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const heading = (
    <span className="flex items-start gap-3">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{job.title}</span>
        <span className="mt-1 block text-secondary">{job.reason}</span>
      </span>
      <span className="shrink-0 text-small font-medium whitespace-nowrap text-primary tabular-nums">
        {fillTemplate(t.results.match, { score: job.matchScore })}
      </span>
    </span>
  );
  const hasSkills = job.keyStrengths.length > 0 || job.missingSkills.length > 0;
  if (!hasSkills) {
    return (
      <li>
        <DrawablyCard className="px-4 py-3">{heading}</DrawablyCard>
      </li>
    );
  }
  return (
    <li>
      <DrawablyCard className="p-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-12 w-full cursor-pointer items-start gap-2 px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1">{heading}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              "mt-0.5 size-4 shrink-0 text-secondary transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={panelId}
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduceMotion ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <dl className="space-y-3 px-4 pb-4 text-small">
                {job.keyStrengths.length > 0 ? (
                  <div>
                    <dt className="text-muted">{t.results.strengths}</dt>
                    <dd className="mt-1.5 flex flex-wrap gap-1.5">
                      {job.keyStrengths.map((skill) => (
                        <Badge key={skill} tone="pass">
                          {skill}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                ) : null}
                {job.missingSkills.length > 0 ? (
                  <div>
                    <dt className="text-muted">{t.results.missingSkills}</dt>
                    <dd className="mt-1.5 flex flex-wrap gap-1.5">
                      {job.missingSkills.map((skill) => (
                        <Badge key={skill} tone="advisory">
                          {skill}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </motion.div>
          )}
        </AnimatePresence>
      </DrawablyCard>
    </li>
  );
}

export function JobList({ jobs }: { jobs: readonly SuggestedJob[] }) {
  const { t } = useI18n();
  if (jobs.length === 0) {
    return null;
  }
  // Results stored before AC-03.1 can hold up to 10 roles, so the list keeps the best 5 here too.
  const ordered = [...jobs].sort((a, b) => b.matchScore - a.matchScore).slice(0, SUGGESTED_JOB_COUNT);
  return (
    <section data-section="jobs" aria-labelledby="jobs-heading">
      <h3 id="jobs-heading" className="mb-3 text-h3">
        {t.results.jobs}
      </h3>
      <ul className="space-y-3">
        {ordered.map((job, index) => (
          // Titles come from the AI and can repeat.
          <JobCard key={`${index}-${job.title}`} job={job} />
        ))}
      </ul>
    </section>
  );
}
