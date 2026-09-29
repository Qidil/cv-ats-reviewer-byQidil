// Phase 6 end-to-end journey (rules.md §6.4, owner decision P6-D1). Run it with the Playwright MCP:
// browser_run_code_unsafe with `filename` set to this file, against `npm run start -- -p 3100`.
// It builds a fictional CV in memory, talks to the real server and AI, and returns pass/fail
// checks with counts only, never CV text.
//
// Two AI analyses outlast one MCP call, so the first call starts the journey and returns at once.
// Call the file again to see the checks so far; the call after it ends returns the result and
// clears it, and the next call starts a fresh run. State lives on `page` because the sandbox
// resets globals between calls.
/* eslint-disable @typescript-eslint/no-unused-expressions -- the MCP evaluates this file as one function expression */
async (page) => {
  const current = page.__cvAtsE2e;
  if (current?.running) {
    return { status: "running", seconds: Math.round((Date.now() - current.startedAt) / 1000), checks: current.checks };
  }
  if (current) {
    delete page.__cvAtsE2e;
    return { status: "done", ...current.result };
  }

  // The owner's server usually runs on 3000; set page.__cvAtsE2eBase first to point the run there.
  const BASE = page.__cvAtsE2eBase || "http://localhost:3100";
  const AI_WAIT_MS = 150_000;
  const checks = [];
  const check = (name, pass, detail = "") => checks.push({ name, pass: Boolean(pass), detail: String(detail) });
  const problems = [];
  const onConsole = (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text().slice(0, 120)}`);
  };
  const onPageError = (error) => problems.push(`pageerror: ${error.message.slice(0, 120)}`);
  const state = { running: true, startedAt: Date.now(), checks, result: null };
  page.__cvAtsE2e = state;
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  const summary = () => ({ passed: checks.filter((item) => item.pass).length, total: checks.length, checks, problems });
  journey()
    .then(
      () => (state.result = summary()),
      (error) => {
        check("journey finished without a script error", false, error.message.split("\n")[0].slice(0, 200));
        state.result = summary();
      },
    )
    .finally(() => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      state.running = false;
    });
  return { status: "started", note: "Call this file again to follow the run." };

  async function journey() {
    /** A text PDF with Helvetica lines; characters 0-255 only, the same shape the unit tests build. */
    function buildPdf(lines) {
      const content = lines
        .map(({ text, x = 72, y, size = 10 }) => `BT /F1 ${size} Tf ${x} ${y} Td (${text.replace(/[\\()]/g, (c) => `\\${c}`)}) Tj ET`)
        .join("\n");
      const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 3 0 R >> >> >>",
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      ];
      let pdf = "%PDF-1.4\n";
      const offsets = objects.map((body, index) => {
        const offset = pdf.length;
        pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
        return offset;
      });
      const xref = pdf.length;
      pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
      pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
      pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      return pdf;
    }

    /** The MCP sandbox has no Node Buffer, so the File is made in the page and handed to the input. */
    async function choosePdf(name, latin1) {
      await page.locator('input[type="file"]').evaluate(
        (input, file) => {
          const bytes = Uint8Array.from(file.latin1, (char) => char.charCodeAt(0));
          const transfer = new DataTransfer();
          transfer.items.add(new File([bytes], file.name, { type: "application/pdf" }));
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        },
        { name, latin1 },
      );
    }

    const cvLines = [
      { text: "Budi Santoso", y: 740, size: 18 },
      { text: "Backend Developer | budi.santoso@example.com | +62 812 0000 0000 | Jakarta", y: 720 },
      { text: "SUMMARY", y: 690, size: 12 },
      { text: "Backend developer with four years of experience building payment APIs in TypeScript and Node.js.", y: 674 },
      { text: "EXPERIENCE", y: 648, size: 12 },
      { text: "Backend Developer, PT Contoh Digital, 2022 - 2026", y: 632 },
      { text: "- Responsible for maintaining the payment service and its REST API.", y: 616 },
      { text: "- Worked on database queries in PostgreSQL for the reporting team.", y: 602 },
      { text: "- Helped the team with code reviews and deployments.", y: 588 },
      { text: "Junior Developer, CV Contoh Kreatif, 2020 - 2022", y: 568 },
      { text: "- Built internal tools with Express and MySQL.", y: 552 },
      { text: "EDUCATION", y: 526, size: 12 },
      { text: "S1 Teknik Informatika, Universitas Contoh, 2016 - 2020", y: 510 },
      { text: "SKILLS", y: 484, size: 12 },
      { text: "TypeScript, Node.js, Express, PostgreSQL, MySQL, REST API, Git, Docker", y: 468 },
    ];
    const cvPdf = buildPdf(cvLines);
    const jobDescription =
      "Backend Engineer. Requirements: TypeScript, Node.js, PostgreSQL, Kubernetes, and AWS. Build and run payment APIs, write tests, and improve query performance. Nice to have: Redis and message queues.";

    /** Waits for the result, retrying once when the AI or the network says a retry can work (P6-T3). */
    async function waitForResult(headingName, tryAgainName) {
      const deadline = Date.now() + AI_WAIT_MS;
      let retried = false;
      while (Date.now() < deadline) {
        if (await page.getByRole("heading", { level: 2, name: headingName, exact: true }).isVisible()) return { ok: true, retried };
        const tryAgain = page.getByRole("button", { name: tryAgainName, exact: true });
        if (await tryAgain.isVisible()) {
          const alertText = (await page.getByRole("alert").first().textContent().catch(() => "")) ?? "";
          if (retried) return { ok: false, retried, reason: `AI unavailable: ${alertText.slice(0, 100)}` };
          retried = true;
          await tryAgain.click();
        }
        await page.waitForTimeout(1000);
      }
      return { ok: false, retried, reason: "timed out" };
    }

    const inspectorState = () =>
      page.evaluate(() => {
        const highlights = Array.from(document.querySelectorAll('button[id*="-highlight-"]'));
        const boxes = highlights.map((node) => node.getAttribute("style") ?? "");
        return {
          highlights: highlights.length,
          distinct: new Set(boxes).size,
          thick: highlights.filter((node) => node.className.includes("border-[2.5px]")).length,
          counter: document.querySelector('[aria-live="polite"]')?.textContent ?? "",
        };
      });

    // 1. A first visit on this origin: storage cleared, language cookie reset (P6-T5).
    await page.goto(`${BASE}/en`);
    await page.evaluate(async () => {
      localStorage.clear();
      document.cookie = "lang=; path=/; max-age=0";
      const databases = (await indexedDB.databases?.()) ?? [];
      await Promise.all(
        databases.map(
          (database) =>
            new Promise((resolve) => {
              const request = indexedDB.deleteDatabase(database.name);
              request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
            }),
        ),
      );
    });
    await page.goto(`${BASE}/`);
    await page.waitForURL(/\/en$/);
    // Deleting the open database makes Dexie warn in the old page; that comes from this cleanup, not the app.
    problems.length = 0;
    check("first visit redirects to /en", page.url().endsWith("/en"), page.url().replace(BASE, ""));

    // Phase 9 navigation: the burger drawer on the landing page, the hero CTA, and the workspace return link.
    await page.getByRole("button", { name: "Menu" }).click();
    check(
      "burger drawer opens on the landing page",
      await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "FAQ" }).isVisible(),
    );
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Start Free Review" }).click();
    await page.waitForURL(/\/en\/app$/);
    check("hero CTA opens the workspace", page.url().endsWith("/en/app"), page.url().replace(BASE, ""));
    check(
      "workspace offers the Main Page button",
      await page.getByRole("button", { name: "Main Page" }).isVisible(),
    );
    check("empty form shows", await page.getByRole("button", { name: "Choose a file" }).isVisible());

    // 2. Mode A in English.
    await choosePdf("cv-budi-santoso.pdf", cvPdf);
    check("file card shows the chosen PDF", await page.getByText("cv-budi-santoso.pdf").isVisible());
    await page.getByRole("radio", { name: /Match a job posting/ }).check();
    await page.getByRole("textbox", { name: "Job title (optional)", exact: true }).fill("Backend Engineer");
    await page.getByRole("textbox", { name: "Job description", exact: true }).fill(jobDescription);
    const started = Date.now();
    await page.getByRole("button", { name: "Analyze CV", exact: true }).click();
    const modeA = await waitForResult("Result", "Try again");
    check("Mode A result arrives (English)", modeA.ok, modeA.ok ? `${Math.round((Date.now() - started) / 1000)} s${modeA.retried ? ", after one retry" : ""}` : modeA.reason);
    if (!modeA.ok) return;
    await page.waitForTimeout(800);

    // 3. The report.
    const score = Number(await page.getByRole("region", { name: "ATS score" }).locator(".text-display").textContent());
    check("score is 0 to 100", score >= 0 && score <= 100, score);
    const checkRows = await page.getByRole("region", { name: "Checks" }).getByRole("listitem").count();
    check("six checks", checkRows === 6, checkRows);
    const suggestionRegion = page.getByRole("region", { name: "What to change" });
    const badges = await suggestionRegion.locator(":scope > ul > li").evaluateAll((cards) => cards.map((card) => card.querySelector("span")?.textContent ?? ""));
    const firstOther = badges.findIndex((badge) => badge !== "Must change");
    const highFirst = firstOther === -1 || badges.slice(firstOther).every((badge) => badge !== "Must change");
    check("suggestions listed with red items first", badges.length > 0 && highFirst, `${badges.length} cards`);
    check("no roles section in Mode A", (await page.getByRole("region", { name: "Roles that fit this CV best" }).count()) === 0);
    const images = await page.getByRole("img", { name: /^Page \d+ of your CV$/ }).count();
    check("page image shown", images >= 1, images);

    // 4. The inspector link, both ways.
    const shows = page.getByRole("button", { name: "Show in CV", exact: true });
    const showCount = await shows.count();
    const before = await inspectorState();
    // DELTA-63: cards quoting the same full rect set share one box, so there can be fewer boxes than buttons.
    // Two different boxes may still share their first rect (the style only shows the first), so the merge is
    // guaranteed by the unit test and the pointer check below guards reachability.
    check(
      "every Show in CV button has a box, one box per quoted line",
      showCount === 0 ? before.highlights === 0 : before.highlights >= 1 && before.highlights <= showCount,
      `${before.highlights} boxes for ${showCount} buttons`,
    );
    if (showCount > 0) {
      await shows.first().click();
      await page.waitForTimeout(600);
      const after = await inspectorState();
      check("Show in CV marks its highlight", after.thick >= 1, after.counter);
      const onTop = await page.locator('button[id*="-highlight-"]').evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === node;
        }),
      );
      // Boxes on another page or scrolled out of the viewer cannot be hit-tested, so one in view must be.
      check("a highlight in view takes the pointer where it is drawn", onTop.some(Boolean), `${onTop.filter(Boolean).length} of ${onTop.length}`);
      const highlight = page.locator('button[id*="-highlight-"]').nth(Math.max(onTop.indexOf(true), 0));
      const label = (await highlight.getAttribute("aria-label")) ?? "";
      await highlight.click();
      await page.waitForTimeout(700);
      const focused = await page.evaluate(() => ({ tag: document.activeElement?.tagName ?? "", text: document.activeElement?.textContent ?? "" }));
      // A shared box lists its cards joined with "; " and focuses the lead card, so the first segment names it (DELTA-63).
      const leadSegment = label.split("; ")[0] ?? "";
      check("a highlight focuses its card title", focused.tag === "H4" && leadSegment.endsWith(focused.text), focused.tag);
    }

    // 5. History and a reload without the network.
    await page.getByRole("button", { name: "History", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "History" });
    const rows = await drawer.getByRole("listitem").count();
    check("History lists the CV once", rows === 1, rows);
    await page.keyboard.press("Escape");
    let analyzeCalls = 0;
    await page.route("**/api/analyze", (route) => {
      analyzeCalls++;
      return route.abort();
    });
    await page.reload();
    const reopened = await page
      .getByRole("heading", { level: 2, name: "Result", exact: true })
      .waitFor({ timeout: 15_000 })
      .then(() => true, () => false);
    check("result reopens from IndexedDB after a reload", reopened);
    check("the reload sends no analysis request", analyzeCalls === 0, analyzeCalls);
    await page.unroute("**/api/analyze");

    // 6. Indonesian interface, stored result unchanged.
    await page.getByRole("button", { name: "Language" }).click();
    await page.getByRole("option", { name: "ID" }).click();
    await page.waitForURL(/\/id\/app$/);
    const stored = await page
      .getByRole("heading", { level: 2, name: "Hasil", exact: true })
      .waitFor({ timeout: 15_000 })
      .then(() => true, () => false);
    check("switching to /id keeps the stored result", stored);
    check("the note names the result's language", await page.getByText("Hasil ini ditulis dalam bahasa Inggris.").isVisible());
    check("the stored check names stay English", await page.getByText("Keyword Match", { exact: true }).isVisible());
    // AC-11.2: the choice is remembered, so the bare address now opens the Indonesian interface.
    await page.goto(`${BASE}/`);
    await page.waitForURL(/\/id$/);
    check("/ opens /id after choosing Indonesian", page.url().endsWith("/id"), page.url().replace(BASE, ""));
    await page.goto(`${BASE}/id/app`);
    await page.getByRole("heading", { level: 2, name: "Hasil", exact: true }).waitFor({ timeout: 15_000 });

    // 7. Mode B on the stored CV, in Indonesian, without choosing the file again.
    await page.getByRole("button", { name: "Analisis lagi", exact: true }).click();
    check("the stored CV is ready for a new analysis", await page.getByText("Dari riwayat Anda").isVisible());
    await page.getByRole("radio", { name: /Tinjauan umum/ }).check();
    const startedB = Date.now();
    await page.getByRole("button", { name: "Analisis CV", exact: true }).click();
    const modeB = await waitForResult("Hasil", "Coba lagi");
    check("Mode B result arrives (Indonesian)", modeB.ok, modeB.ok ? `${Math.round((Date.now() - startedB) / 1000)} s${modeB.retried ? ", after one retry" : ""}` : modeB.reason);
    if (modeB.ok) {
      await page.waitForTimeout(800);
      check("check names are Indonesian", await page.getByText("Kesesuaian Kata Kunci", { exact: true }).isVisible());
      const roles = page.getByRole("region", { name: "Posisi yang paling cocok dengan CV ini" });
      const matches = await roles.getByText(/^Cocok \d+%$/).allTextContents();
      const scores = matches.map((text) => Number(text.replace(/\D/g, "")));
      check("exactly 5 roles", scores.length === 5, scores.length);
      check("roles best first", scores.every((value, index) => index === 0 || value <= scores[index - 1]), scores.join(", "));

      // 8. History keeps one CV with its latest analysis; English keeps the Indonesian result.
      await page.getByRole("button", { name: "Riwayat", exact: true }).click();
      const drawerId = page.getByRole("dialog", { name: "Riwayat" });
      check("History still lists one CV", (await drawerId.getByRole("listitem").count()) === 1);
      check("its latest analysis is the general review", await drawerId.getByText(/Tinjauan umum/).isVisible());
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Bahasa" }).click();
      await page.getByRole("option", { name: "EN" }).click();
      await page.waitForURL(/\/en\/app$/);
      const kept = await page
        .getByText("This result was written in Indonesian.")
        .waitFor({ timeout: 15_000 })
        .then(() => true, () => false);
      check("back in English, the Indonesian result stays with its note", kept);
    }

    // 9. Console.
    check("no console errors or warnings", problems.length === 0, problems.length);
  }
}
