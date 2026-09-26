import type { Language } from "@/lib/i18n/language";
import type { GraphicKind, HiddenReason } from "@/lib/pdf/types";
import type { AtsCheckId } from "@/types/ats";

export type RubricSection = "summary" | "experience" | "education" | "skills";

interface SuggestionText {
  title: string;
  description: (detail: string) => string;
}

/** Every sentence the rubric can write, per language (BR-13). The rules stay in rubric.ts. */
export interface RubricText {
  numberLocale: string;
  checkNames: Readonly<Record<AtsCheckId, string>>;
  sectionLabels: Readonly<Record<RubricSection, string>>;
  moreItems: (shown: string, extra: number) => string;
  lengthIssue: (min: number, max: string) => string;
  keyword: {
    withoutJob: string;
    jobTooShort: string;
    allFound: (count: number) => string;
    missing: (list: string) => string;
  };
  skills: {
    withoutJob: string;
    noSection: string;
    jobTooShort: string;
    allFound: (count: number) => string;
    missing: (list: string) => string;
  };
  sections: { allPresent: string; missing: (list: string) => string };
  graphicLabels: Readonly<Record<GraphicKind, string>>;
  formatting: {
    noEmail: string;
    noPhone: string;
    noBullets: string;
    table: string;
    tabs: string;
    twoColumns: string;
    graphics: (list: string) => string;
    ok: string;
    typographyUnavailable: string;
    hiddenText: string;
    hiddenUnchecked: string;
    ocr: string;
  };
  needsFixing: (issues: string) => string;
  quantified: { noBullets: string; count: (withNumbers: number, total: number) => string };
  readability: { noSummary: string; longBullets: string; ok: string };
  suggestions: {
    keyword: SuggestionText;
    skills: SuggestionText;
    sections: SuggestionText;
    formatting: SuggestionText;
    quantified: { title: string; general: string; quote: (quote: string) => string };
    readability: SuggestionText;
  };
  hidden: {
    reasons: Readonly<Record<HiddenReason, string>>;
    title: string;
    description: (reasons: string) => string;
  };
  typography: {
    fontCount: { title: string; description: (count: number, families: string) => string; note: (count: number) => string };
    fontFamily: { title: string; description: (fonts: string) => string; note: (fonts: string) => string };
    titleSize: { title: string; description: (size: string) => string; note: (size: string) => string };
    bodySize: { title: string; description: (size: string) => string; note: (size: string) => string };
    lineSpacing: {
      tight: string;
      loose: string;
      title: string;
      description: (spacing: string) => string;
      note: (spacing: string) => string;
    };
    margins: {
      title: string;
      description: (left: string, right: string, top: string, bottom: string) => string;
      note: string;
    };
    boldOveruse: { title: string; description: (percent: number) => string; note: (percent: number) => string };
    italicOveruse: { title: string; description: (percent: number) => string; note: (percent: number) => string };
    boldUnderuse: { title: string; description: string; note: string };
    summary: (notes: string) => string;
  };
}

const EN: RubricText = {
  numberLocale: "en-US",
  checkNames: {
    keyword: "Keyword Match",
    skills: "Skills Coverage",
    sections: "Section Completeness",
    formatting: "ATS-Friendly Format",
    quantified: "Quantified Achievements",
    readability: "Readability & Structure",
  },
  sectionLabels: { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills" },
  moreItems: (shown, extra) => `${shown}, and ${extra} more`,
  lengthIssue: (min, max) => `CV length outside ${min} to ${max} words`,
  keyword: {
    withoutJob: "Without a job description, keyword match is scored by the AI.",
    jobTooShort: "The job description is too short to take keywords from.",
    allFound: (count) => `All ${count} keywords and phrases from the job description appear in the CV.`,
    missing: (list) => `Not in the CV yet: ${list}.`,
  },
  skills: {
    withoutJob: "Without a job description, skills coverage is scored by the AI.",
    noSection: "No Skills section was found in the CV.",
    jobTooShort: "The job description is too short to score skills coverage.",
    allFound: (count) => `Every keyword from the job description is listed in the Skills section (${count}).`,
    missing: (list) => `Not in the Skills section yet: ${list}.`,
  },
  sections: {
    allPresent: "All four standard sections are present: Summary, Experience, Education, and Skills.",
    missing: (list) => `Missing sections: ${list}.`,
  },
  graphicLabels: { bar: "skill bars or charts", image: "images or photos", shading: "gradient backgrounds" },
  formatting: {
    noEmail: "no email address",
    noPhone: "no phone number",
    noBullets: "no bullet points",
    table: "a table or columns built with the | character",
    tabs: "a layout built with tabs",
    twoColumns: "a 2-column layout",
    graphics: (list) => `graphics an ATS cannot read (${list})`,
    ok: "Easy for an ATS to read: email, phone number, bullet points, and a reasonable length.",
    typographyUnavailable: "Typography and layout cannot be assessed for this PDF.",
    hiddenText: "The PDF contains text that cannot be seen. That text was left out of the analysis and does not affect the score.",
    hiddenUnchecked: "Hidden text could not be checked for this PDF.",
    ocr: "This CV is a scan with OCR text, so an ATS may read it less accurately.",
  },
  needsFixing: (issues) => `Needs fixing: ${issues}.`,
  quantified: {
    noBullets: "No bullet points to check for numbers.",
    count: (withNumbers, total) => `${withNumbers} of ${total} bullet points contain a number or metric.`,
  },
  readability: {
    noSummary: "no professional summary",
    longBullets: "bullet points are too long",
    ok: "Easy to read: a summary, short bullet points, and a reasonable length.",
  },
  suggestions: {
    keyword: {
      title: "Use the terms from the job description",
      description: (detail) =>
        `Write the job description's terms exactly as they appear there in your Summary, Skills, and Experience sections. ${detail}`,
    },
    skills: {
      title: "Complete the Skills section",
      description: (detail) => `List every skill the job description asks for at least once in the Skills section. ${detail}`,
    },
    sections: {
      title: "Add the missing CV sections",
      description: (detail) => `Use common section headings: Summary, Experience, Education, and Skills. ${detail}`,
    },
    formatting: {
      title: "Fix the format so an ATS can read it",
      description: (detail) => `Change the parts an ATS may fail to read. ${detail}`,
    },
    quantified: {
      title: "Add numbers to achievements",
      general: "Replace task descriptions with measurable results, such as a percentage, a count, or a time saved.",
      quote: (quote) =>
        `Rewrite the bullet point "${quote}" as a measurable result, such as a percentage, a count, or a time saved.`,
    },
    readability: {
      title: "Shorten sentences and bullet points",
      description: (detail) => `Write a 2 to 4 line summary and keep every bullet point under 25 words. ${detail}`,
    },
  },
  hidden: {
    reasons: {
      "low-contrast": "its color matches or nearly matches the background",
      "invisible-mode": "it is set to invisible",
      transparent: "it is transparent",
      "tiny-font": "it is 2 pt or smaller",
      "off-page": "it sits outside the page",
    },
    title: "Delete the invisible text",
    description: (reasons) =>
      `This PDF contains text a reader cannot see: ${reasons}. Delete that text from the CV's source file. It was left out of this analysis, but an ATS can still read it.`,
  },
  typography: {
    fontCount: {
      title: "Use one font",
      description: (count, families) =>
        `The CV uses ${count} fonts: ${families}. Use one font for the whole CV and set headings apart with size and bold.`,
      note: (count) => `${count} fonts`,
    },
    fontFamily: {
      title: "Use Arial, Calibri, or Helvetica",
      description: (fonts) => `The CV uses ${fonts}. Switch to Arial, Calibri, or Helvetica.`,
      note: (fonts) => `font ${fonts}`,
    },
    titleSize: {
      title: "Adjust the name or heading size",
      description: (size) => `The name or heading is ${size} pt now. Use 14 to 16 pt.`,
      note: (size) => `heading ${size} pt (ideal 14 to 16)`,
    },
    bodySize: {
      title: "Adjust the body text size",
      description: (size) => `Body text is ${size} pt now. Use 10 to 12 pt, ideally 10 or 11 pt.`,
      note: (size) => `body ${size} pt (ideal 10 to 12)`,
    },
    lineSpacing: {
      tight: "tight",
      loose: "loose",
      title: "Adjust the line spacing",
      description: (spacing) => `The CV's line spacing is too ${spacing}. Set it to 1.0 to 1.15 in the app you write the CV in.`,
      note: (spacing) => `line spacing too ${spacing}`,
    },
    margins: {
      title: "Adjust the page margins",
      description: (left, right, top, bottom) =>
        `Measured margins: left ${left}, right ${right}, top ${top}, bottom ${bottom} pt. Use about 1 inch (72 pt) on every side.`,
      note: "margins not 1 inch",
    },
    boldOveruse: {
      title: "Use less bold text",
      description: (percent) =>
        `${percent}% of the body text is bold. Keep bold for section headings, your name, and measurable achievements.`,
      note: (percent) => `bold ${percent}% (max 30%)`,
    },
    italicOveruse: {
      title: "Use less italic text",
      description: (percent) => `${percent}% of the body text is italic. Keep italics for subheadings or job titles.`,
      note: (percent) => `italic ${percent}% (max 30%)`,
    },
    boldUnderuse: {
      title: "Make your name and section headings bold",
      description: "Your name and section headings are not bold yet. Bold helps recruiters and ATS find the CV's structure.",
      note: "headings not bold",
    },
    summary: (notes) => `Typography: ${notes}.`,
  },
};

const ID: RubricText = {
  numberLocale: "id-ID",
  checkNames: {
    keyword: "Kesesuaian Kata Kunci",
    skills: "Cakupan Keahlian",
    sections: "Kelengkapan Bagian CV",
    formatting: "Format Ramah ATS",
    quantified: "Pencapaian Terukur",
    readability: "Keterbacaan & Struktur Teks",
  },
  sectionLabels: { summary: "Ringkasan", experience: "Pengalaman", education: "Pendidikan", skills: "Keahlian" },
  moreItems: (shown, extra) => `${shown}, dan ${extra} lainnya`,
  lengthIssue: (min, max) => `panjang CV di luar ${min} sampai ${max} kata`,
  keyword: {
    withoutJob: "Tanpa deskripsi pekerjaan, kecocokan kata kunci dinilai oleh AI.",
    jobTooShort: "Deskripsi pekerjaan terlalu pendek untuk diambil kata kuncinya.",
    allFound: (count) => `Semua ${count} kata kunci dan frasa dari deskripsi pekerjaan ada di CV.`,
    missing: (list) => `Belum ada di CV: ${list}.`,
  },
  skills: {
    withoutJob: "Tanpa deskripsi pekerjaan, cakupan keahlian dinilai oleh AI.",
    noSection: "Bagian Keahlian tidak ditemukan di CV.",
    jobTooShort: "Deskripsi pekerjaan terlalu pendek untuk menilai cakupan keahlian.",
    allFound: (count) => `Semua kata kunci dari deskripsi pekerjaan tercantum di bagian Keahlian (${count}).`,
    missing: (list) => `Bagian Keahlian belum memuat: ${list}.`,
  },
  sections: {
    allPresent: "Keempat bagian standar ada: Ringkasan, Pengalaman, Pendidikan, dan Keahlian.",
    missing: (list) => `Bagian yang belum ada: ${list}.`,
  },
  graphicLabels: { bar: "bar keahlian atau grafik", image: "gambar atau foto", shading: "latar gradasi" },
  formatting: {
    noEmail: "belum ada email",
    noPhone: "belum ada nomor telepon",
    noBullets: "belum ada bullet point",
    table: "ada tabel atau teks berkolom dengan tanda |",
    tabs: "ada tata letak dengan tab",
    twoColumns: "tata letak 2 kolom",
    graphics: (list) => `ada grafis yang tidak terbaca ATS (${list})`,
    ok: "Mudah dibaca ATS: ada email, nomor telepon, bullet point, dan panjang CV wajar.",
    typographyUnavailable: "Tipografi dan tata letak tidak dapat dinilai untuk PDF ini.",
    hiddenText: "Ada teks yang tidak terlihat di PDF. Teks itu tidak ikut dianalisis dan tidak memengaruhi skor.",
    hiddenUnchecked: "Teks tersembunyi tidak dapat diperiksa untuk PDF ini.",
    ocr: "CV ini hasil scan dengan teks OCR, jadi hasil baca ATS bisa kurang akurat.",
  },
  needsFixing: (issues) => `Perlu diperbaiki: ${issues}.`,
  quantified: {
    noBullets: "Tidak ada bullet point yang bisa dinilai angkanya.",
    count: (withNumbers, total) => `${withNumbers} dari ${total} bullet point memuat angka atau metrik.`,
  },
  readability: {
    noSummary: "belum ada ringkasan profesional",
    longBullets: "bullet point terlalu panjang",
    ok: "Mudah dibaca: ada ringkasan, bullet point ringkas, dan panjang CV wajar.",
  },
  suggestions: {
    keyword: {
      title: "Pakai istilah dari deskripsi pekerjaan",
      description: (detail) =>
        `Tulis istilah dari deskripsi pekerjaan persis seperti aslinya di bagian Ringkasan, Keahlian, dan Pengalaman. ${detail}`,
    },
    skills: {
      title: "Lengkapi bagian Keahlian",
      description: (detail) =>
        `Cantumkan setiap keahlian yang diminta deskripsi pekerjaan minimal sekali di bagian Keahlian. ${detail}`,
    },
    sections: {
      title: "Tambahkan bagian CV yang belum ada",
      description: (detail) => `Pakai judul bagian yang umum: Ringkasan, Pengalaman, Pendidikan, dan Keahlian. ${detail}`,
    },
    formatting: {
      title: "Rapikan format agar terbaca ATS",
      description: (detail) => `Ubah bagian yang berisiko gagal dibaca ATS. ${detail}`,
    },
    quantified: {
      title: "Tambahkan angka pada pencapaian",
      general: "Ganti uraian tugas dengan hasil yang terukur, misalnya persentase, jumlah, atau waktu.",
      quote: (quote) => `Ubah bullet point "${quote}" menjadi hasil yang terukur, misalnya persentase, jumlah, atau waktu.`,
    },
    readability: {
      title: "Ringkas kalimat dan bullet point",
      description: (detail) => `Buat ringkasan 2 sampai 4 baris dan jaga setiap bullet point di bawah 25 kata. ${detail}`,
    },
  },
  hidden: {
    reasons: {
      "low-contrast": "warnanya sama atau hampir sama dengan latar",
      "invisible-mode": "dibuat tidak terlihat",
      transparent: "dibuat transparan",
      "tiny-font": "ukurannya 2 pt atau lebih kecil",
      "off-page": "letaknya di luar halaman",
    },
    title: "Hapus teks yang tidak terlihat",
    description: (reasons) =>
      `PDF ini memuat teks yang tidak terlihat oleh pembaca: ${reasons}. Hapus teks itu dari file asli CV. Teks tersebut tidak ikut dianalisis di sini, tetapi tetap bisa terbaca oleh sistem ATS lain.`,
  },
  typography: {
    fontCount: {
      title: "Pakai satu jenis font",
      description: (count, families) =>
        `CV memakai ${count} font: ${families}. Pakai satu font untuk seluruh CV, lalu bedakan judul dengan ukuran dan huruf tebal.`,
      note: (count) => `${count} jenis font`,
    },
    fontFamily: {
      title: "Pakai Arial, Calibri, atau Helvetica",
      description: (fonts) => `CV memakai font ${fonts}. Ganti dengan salah satu dari Arial, Calibri, atau Helvetica.`,
      note: (fonts) => `font ${fonts}`,
    },
    titleSize: {
      title: "Sesuaikan ukuran nama atau judul",
      description: (size) => `Ukuran nama atau judul sekarang ${size} pt. Pakai 14 sampai 16 pt.`,
      note: (size) => `judul ${size} pt (ideal 14 sampai 16)`,
    },
    bodySize: {
      title: "Sesuaikan ukuran teks isi",
      description: (size) => `Ukuran teks isi sekarang ${size} pt. Pakai 10 sampai 12 pt, idealnya 10 atau 11 pt.`,
      note: (size) => `isi ${size} pt (ideal 10 sampai 12)`,
    },
    lineSpacing: {
      tight: "rapat",
      loose: "renggang",
      title: "Atur jarak antarbaris",
      description: (spacing) =>
        `Jarak antarbaris CV terlalu ${spacing}. Atur spasi baris ke 1,0 sampai 1,15 di aplikasi pembuat CV.`,
      note: (spacing) => `jarak baris terlalu ${spacing}`,
    },
    margins: {
      title: "Atur margin halaman",
      description: (left, right, top, bottom) =>
        `Margin terukur: kiri ${left}, kanan ${right}, atas ${top}, bawah ${bottom} pt. Pakai sekitar 1 inci (72 pt) di setiap sisi.`,
      note: "margin bukan 1 inci",
    },
    boldOveruse: {
      title: "Kurangi teks tebal",
      description: (percent) =>
        `${percent}% teks isi dicetak tebal. Pakai huruf tebal hanya untuk judul bagian, nama, dan pencapaian terukur.`,
      note: (percent) => `tebal ${percent}% (maks 30%)`,
    },
    italicOveruse: {
      title: "Kurangi teks miring",
      description: (percent) => `${percent}% teks isi dicetak miring. Pakai huruf miring hanya untuk subjudul atau jabatan.`,
      note: (percent) => `miring ${percent}% (maks 30%)`,
    },
    boldUnderuse: {
      title: "Tebalkan nama dan judul bagian",
      description: "Nama dan judul bagian belum dicetak tebal. Huruf tebal membantu perekrut dan ATS menemukan struktur CV.",
      note: "judul belum tebal",
    },
    summary: (notes) => `Tipografi: ${notes}.`,
  },
};

export const RUBRIC_TEXT: Readonly<Record<Language, RubricText>> = { en: EN, id: ID };
