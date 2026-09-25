# Project Agent Rules & Standards

Dokumen ini berisi aturan wajib bagi seluruh Agent AI yang bekerja di repositori `cv-ats-reviewer`. Semua instruksi di bawah ini mengikat dan harus dipatuhi secara ketat.

---

## 1. Aturan Git & GitHub (Strict Confirmation Gate)
- **DILARANG KERAS** menjalankan `git commit`, `git push`, membuat tag, atau mempublikasikan PR/branch ke remote repository (GitHub) tanpa persetujuan eksplisit dari pengguna.
- Sebelum meminta konfirmasi commit atau push:
  1. Jalankan `git status` dan `git diff` untuk memeriksa perubahan yang akan di-stage.
  2. Pastikan tidak ada file rahasia (API key, token, kredensial, env file) yang ikut ter-stage.
  3. Tampilkan daftar file yang diubah beserta usulan pesan commit yang jelas.
  4. Tunggu konfirmasi "Ya" atau persetujuan tertulis dari pengguna sebelum mengeksekusi commit maupun push.

---

## 2. Mandatory Quality Gate Setiap Akhir Phase (Full Gate Protocol)
Setiap kali sebuah phase selesai diimplementasikan, Agent **WAJIB** menjalankan rangkaian quality gate lengkap sebelum pekerjaan dinyatakan tuntas:

1. **Urutan Evaluasi Gate (Lakukan Semuanya Terlebih Dahulu):**
   - **Impeccable**: Audit desain UI/UX, layout, typography, micro-interactions, cognitive load, serta penanganan operational states (loading, empty, error).
   - **Antislop**: Jalankan filter anti-AI slop menyeluruh:
     - `antislop-ui`: Hindari layout generik, padding/margin aneh, dan palet warna AI klise.
     - `antislop-copywriting`: Pastikan teks, instruksi, dan CTA terdengar manusiawi, ringkas, dan bebas jargon klise AI.
     - `antislop-human`: Periksa kontras warna, aksesibilitas keyboard, dan fokus state.
     - `antislop-layoutmobile`: Uji responsivitas, overflow, dan tap target.
     - `antislop-code`: Bersihkan komentar kode bergaya AI slop.
   - **Spec-Compliance**: Verifikasi bahwa seluruh hasil implementasi sesuai dengan dokumen spesifikasi di `project-context/` (PRD, Architecture, API, Schema, StyleGuide, Rules).
   - **Code-Review**: Tinjau kualitas kode berdasarkan aspek keamanan, efisiensi, standar arsitektur, dan error handling.

2. **Prosedur Pelaporan & Perbaikan (Report-First):**
   - Selesaikan seluruh evaluasi gate di atas terlebih dahulu.
   - Susun dan sajikan laporan temuan secara terpadu dan transparan.
   - **JANGAN** langsung mengubah kode secara sepihak untuk temuan tersebut.
   - Minta konfirmasi dan persetujuan dari pengguna untuk perbaikan (fix) temuan yang ditemukan. Lakukan perbaikan hanya setelah pengguna menyetujui.

---

## 3. Verifikasi Tampilan Visual Menggunakan MCP Playwright
- Agent **diperbolehkan dan direkomendasikan** menggunakan Playwright MCP (`playwright_browser_navigate`, `playwright_browser_snapshot`, `playwright_browser_take_screenshot`, `playwright_browser_resize`, dll.) untuk memeriksa tampilan aplikasi secara langsung.
- Gunakan Playwright untuk:
  - Memverifikasi apakah tampilan antarmuka bebas dari pola visual "AI slop".
  - Memeriksa rendering responsif pada berbagai ukuran viewport (desktop, tablet, mobile).
  - Memvalidasi kontras warna, alignment komponen, dan states interaktif.

---

## 4. Pelacakan Progres Real-Time dengan TODO List (`todowrite`)
- Agent **WAJIB** membuat dan memperbarui TODO list menggunakan tool `todowrite` secara proaktif.
- Aturan pengelolaan TODO:
  - Pecah pekerjaan menjadi task dan phase yang spesifik dan terukur.
  - Tandai status secara real-time (`pending`, `in_progress`, `completed`).
  - Hanya ada **satu** item dengan status `in_progress` dalam satu waktu.
  - Tandai `completed` hanya jika pekerjaan beserta verifikasinya benar-benar selesai.

---

## 5. Optimalisasi Perintah dengan Plugin RTK
- Gunakan utilitas dan plugin `rtk` (misalnya `rtk git ...`, `rtk npm ...`, `rtk test ...`, dll.) untuk setiap perintah terminal yang didukung.
- Tujuannya adalah meminimalkan penggunaan token dan menjaga efisiensi context window selama interaksi sesi.

---

## 6. Batas Waktu (Timeout) Ketat untuk Eksekusi Terminal / Process
- Saat menjalankan perintah shell/CLI (terutama command yang berpotensi blocking, server dev, build tools, atau script panjang):
  - **WAJIB** menyertakan parameter `timeout` pada pemanggilan tool bash.
  - **Batas waktu default:** **120 detik (120000 ms)**.
  - Jika perintah diperkirakan membutuhkan waktu lebih lama (misal: dependency installation besar, compilation berat), perpanjang timeout secara eksplisit sesuai kebutuhan.
  - Pastikan proses tidak menggantung tanpa batas waktu agar pengguna tidak terjebak pada proses yang tidak dapat dihentikan secara manual.

---

## 7. Dokumentasi Rencana Phase di `project-context/plans/phase-N-...`
- Sebelum memulai atau mengeksekusi suatu phase pengembangan:
  - Agent **WAJIB** mencatat dan mendokumentasikan rencana kerja ke dalam file terpisah dengan format penamaan:
    `project-context/plans/phase-N-<nama-phase>.md` (contoh: `project-context/plans/phase-1-init-setup.md`).
  - Dokumen rencana phase harus memuat:
    1. **Tujuan Phase**: Sasaran utama yang ingin dicapai.
    2. **Daftar Tugas & Subtask**: Rincian langkah implementasi teknis.
    3. **Kriteria Penyelesaian (Definition of Done)**: Syarat objektif terpenuhinya phase.
    4. **Spesifikasi Terkait**: Rujukan ke file spesifikasi `project-context/`.
    5. **Rencana Quality Gate**: Checklist pengujian (Impeccable, Antislop, Spec-Compliance, Code-Review).

---

## 8. Protokol Sesi Rapat Tim (Skill `meet` - Konfirmasi Penutupan Rapat)
- Saat diminta menjalankan sesi rapat tim menggunakan skill `meet`:
  - **DILARANG KERAS** menutup rapat (`Meeting closed`) secara sepihak atau otomatis tanpa konfirmasi dari pengguna.
  - Setelah seluruh persona yang dipilih menyampaikan kontribusinya dan @Galbi menyajikan ringkasan (`## @Galbi — Meeting Summary` yang memisahkan rekomendasi, keputusan yang disetujui, open questions, dan usulan handoff):
    - @Galbi **WAJIB** menanyakan kepada pengguna apakah ada tanggapan, poin tambahan, atau agenda lanjutan yang ingin didiskusikan sebelum rapat diselesaikan.
  - Sesi rapat hanya boleh ditutup (`Meeting closed`) setelah pengguna memberikan konfirmasi eksplisit bahwa diskusi telah selesai dan rapat boleh ditutup.

---

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, load the antislop skill for the task:
- Core filter, always on: `antislop`
- UI / visual: `antislop-ui`
- Copy & text: `antislop-copywriting`
- People: `antislop-human`
- Mobile / responsive: `antislop-layoutmobile`
- Code comments: `antislop-code`
Before starting, ask the user when antislop applies: during the work, or after it is done.
<!-- antislop:end -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
