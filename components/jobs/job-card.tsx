"use client";

import { ChevronDown } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { fillTemplate } from "@/lib/i18n/format";
import { SUGGESTED_JOB_COUNT, type SuggestedJob } from "@/types/ats";

/** PRD §6.2: title, fit, and reason at a glance; the skills open on click. */
function JobCard({ job }: { job: SuggestedJob }) {
  const { t } = useI18n();
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
    return <li className="rounded-lg border border-subtle bg-surface px-4 py-3">{heading}</li>;
  }
  return (
    <li className="rounded-lg border border-subtle bg-surface">
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-start gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">{heading}</span>
          <ChevronDown
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-secondary transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <dl className="space-y-2 px-4 pb-4 text-small">
          {job.keyStrengths.length > 0 ? (
            <div>
              <dt className="text-muted">{t.results.strengths}</dt>
              <dd className="text-secondary">{job.keyStrengths.join(", ")}</dd>
            </div>
          ) : null}
          {job.missingSkills.length > 0 ? (
            <div>
              <dt className="text-muted">{t.results.missingSkills}</dt>
              <dd className="text-secondary">{job.missingSkills.join(", ")}</dd>
            </div>
          ) : null}
        </dl>
      </details>
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
    <section aria-labelledby="jobs-heading">
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
