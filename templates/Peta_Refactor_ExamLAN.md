# PETA REFACTOR FORENSIK — ExamLAN Pro
**Target:** Next.js App Router, **JavaScript murni** (`.js` / `.jsx`, tanpa TypeScript), Tailwind CSS lokal, MySQL 8/InnoDB, template Excel dan Word asli.  **Prioritas:** fungsi sama, pengalaman siswa/guru tetap, koreksi kelemahan tanpa diam-diam mengubah aturan.
**Batas audit:** analisis statis seluruh paket `kuis.zip` (kode, README, JSON aktif, backup historis, gambar, dokumentasi, komponen game), bukan hasil uji runtime PHP+browser. Lokasi baris mengacu ke berkas di ZIP. **Tidak ada data siswa, jawaban nyata, atau hash password yang direproduksi di laporan.**

## 1. Hasil inventaris terverifikasi
- ZIP memuat 55 entri (termasuk folder), ukuran isi sekitar 4,24 MB. Inti: `api.php` 983 baris; `index.html` 988; `guru/index.html` 2746; `guru/data_siswa.html` 118; `pahlawan_office.tsx` 592.
- Ditemukan **34 action HTTP**, **15 fungsi helper PHP**, **39 fungsi JS siswa**, dan **81 fungsi JS guru** (beberapa pada guru adalah salinan siswa tak terpakai).
- Data JSON aktif ketika arsip dibuat: **2 paket kuis, 43 butir soal** (MC 37, complex 2, cause_effect 2, case_analysis 2; belum ada scaled), **25 siswa, 2 hasil, 5 attempt, 2 permintaan extension, 46 audit, 18 referensi backup**. Ada **18 file backup JSON** pada arsip; jangan gabungkan histori backup sebagai data produksi.
- Top-level storage: `questions`, `results`, `review_settings`, `retake_permissions`, `students`, `active_attempts`, `teacher_password_hash`, `teacher_password_changed`, `audit_logs`, `backups`, `trash`, `time_extension_requests`.
- Entry point siswa: `/kuis/` -> `index.html`; guru: `/kuis/guru/` -> `guru/index.html`, bagian siswa guru disembunyikan dengan CSS. Data siswa guru diload dinamis dari `guru/data_siswa.html`.
- `pahlawan_office.tsx` adalah game React/Canvas/WebAudio/Text-to-Speech mandiri dengan bank soal PowerPoint/Word, **bukan bagian flow ujian utama**, karena tidak ada referensi impor/link aplikasi. Jadikan modul opsional jika memang akan diintegrasikan.
- `api_fase1.php` adalah artefak teks bukan API siap pakai; `tes_gemini.js` skrip eksperimen dan docs/checkpoint/upgrade prompt bukan implementasi runtime.

## 2. Perilaku bisnis yang wajib dipertahankan
1. **Guru:** login bcrypt, batas kesalahan lima percobaan sementara, masa idle 30 menit, ganti sandi awal, logout, dashboard ringkasan & monitoring, audit.
2. **Kuis:** judul/durasi/mapel/kelas/deskripsi/status, jadwal akses, PIN/token opsional, CRUD paket, CRUD soal, gambar soal, 5 tipe, validasi jika ACTIVE.
3. **Siswa:** NIS auto-fill berdasarkan daftar, pilih paket aktif/sesuai jadwal, isi PIN, mulai attempt server, acak urutan soal/opsi per attempt, sidebar nomor, autosave saat perubahan (500ms) dan berkala (~8 detik), pemulihan refresh.
4. **Submit:** semua soal harus terjawab sebelum batas waktu, kecuali penyelesaian karena timeout; server mengubah indeks opsi teracak ke indeks asli; hasil server memberi skor/benar/salah dan token review.
5. **Review & retake:** status pembahasan per kuis dikontrol guru dan dipoll siswa tiap 3 detik; izin mengulang per NIS+kuis, jumlah 1–10, alasan, kedaluwarsa; maksimum 5 riwayat aktif tiap siswa/paket.
6. **Extension:** siswa mengajukan setelah timer habis, guru menerima pemberitahuan tiap 10 detik, approve dengan menit fleksibel/reject, siswa cek status tiap 5 detik lalu lanjut/munculkan hasil.
7. **Operasional:** hasil terfilter dan CSV, tabel siswa/foto, import XLSX/XLS/CSV, template soal XLSX, template Word yang sebenarnya HTML `.doc`, import soal `.txt`, trash, reset & backup, analytics, system check.

## 3. Jenis soal & aturan penilaian PHP ASLI
| Tipe | Penyimpanan/kunci | Aturan PHP saat ini | UI / impor |
|---|---|---|---|
| `mc` | `options[]`, `answer` angka 0-based | benar jika jawaban = indeks kunci | radio A-D, Excel/TXT |
| `complex` | `options[]`, `answers[]` angka | benar jika kumpulan indeks sama persis sesudah di-sort | checkbox lebih dari satu |
| `cause_effect` | `statement`, `reason`, `answer` enum 5 nilai | benar jika kode string sama | radio 5 pernyataan hubungan |
| `case_analysis` | `passage`, `question`, `options[]`, `answer` | sama MC | narasi kasus + radio |
| `scaled` | `options[{text,score}]` | nilai berbobot `sum(score pilih)/sum(max opsi) × 100`, benar jika poin >= setengah max | 5 opsi Likert default |
**Penting:** jika **ada satu soal scaled** dalam kuis campuran, `calculateSubmission()` memilih rumus khusus scaled untuk **seluruh skor**, tetapi soal non-scaled tidak menambah `totalObtainedScore` atau `totalMaxScore`. Ini bug baseline, tidak boleh dipindahkan tanpa keputusan. Buat golden test PHP original, lalu spesifikasi rumus campuran yang benar, misalnya normalisasi poin per butir dan pembobotan total. Nilai hasil historis jangan dihitung ulang otomatis.

## 4. Arsitektur target yang diusulkan
```text
examlan-nextjs/
  src/app/page.js                       # halaman siswa
  src/app/guru/layout.js                # auth gate + sidebar
  src/app/guru/page.js                  # dashboard + monitoring
  src/app/guru/kuis/page.js             # paket kuis & editor
  src/app/guru/siswa/page.js            # daftar siswa/import
  src/app/guru/hasil/page.js            # rekap & retake
  src/app/guru/analitik/page.js         # analytics
  src/app/guru/operasional/page.js      # backup, trash, status, audit
  src/app/api/.../route.js              # 34 action dipetakan ke route domain
  src/components/student/              # ExamShell, QuestionRenderer, Timer, Results
  src/components/teacher/              # QuizEditor, ResultsTable, ImportDialog
  src/components/ui/                   # Modal, Toast, Table, FileUpload
  src/hooks/useAutosaveAnswers.js       # debounce, offline, retry
  src/lib/db/pool.js                    # mysql2/promise pool
  src/lib/auth/                         # teacher session & student token
  src/lib/services/                     # exam, grading, quiz, students, result, review
  src/lib/import/                       # parseExcel.js, parseDocx.js, parseTxt.js
  src/lib/export/                       # templates.js, resultsCsv.js
  src/lib/validation/                   # input schemas, per-type validation
  src/lib/legacy/                       # import-db-json.js, parity-fixtures.js
  db/migrations/                         # SQL versioned
  public/uploads/  (hanya jika file memang publik; nama acak)
  storage/private/                      # data/backup/secret di luar public
```
- **Gunakan JavaScript**, bukan TypeScript: `jsconfig.json` alias `@/*`, tidak ada `.ts`, `.tsx`, atau `tsconfig.json`. React Client Components bertanda `"use client"`; SQL, grading, hashing, dan otorisasi hanya di server.
- **Server Node Next.js satu origin dengan siswa/guru**; Tailwind dipaketkan saat build, font dan ikon lokal (tanpa CDN). MySQL satu instance InnoDB. Gunakan `mysql2/promise`, SQL parameterized dan transaksi eksplisit, bisa ditambah query builder nanti.
- Deployment LAN/XAMPP: PHP/Apache lama boleh berjalan paralel untuk situs lain. Node Next.js misalnya port 3000 dan MySQL port 3306; bila ingin URL lama `/kuis`, pasang reverse proxy Apache ke Next.js atau gunakan base path konsisten. **Jangan** jalankan dua layanan di port 80. XAMPP bukan keharusan untuk aplikasi Next.js.

## 5. Peta dari 34 action PHP ke Next.js
| Action lama | Sumber | HTTP | Guard | Service target |
|---|---|---|---|---|
| `teacher_login` | `api.php:269` | POST | Publik | `authService.loginTeacher` |
| `change_teacher_password` | `api.php:295` | POST | Guru | `authService.changePassword` |
| `teacher_logout` | `api.php:310` | POST | Guru | `authService.logoutTeacher` |
| `teacher_status` | `api.php:322` | GET | Publik (session) | `authService.getTeacherSession` |
| `get_student_data` | `api.php:328` | GET | Publik | `quizService.listPublicQuizzes; studentLookup` |
| `get_data` | `api.php:328` | GET | Guru | `dashboardService.getBootstrap` |
| `check_attempt` | `api.php:363` | GET | Publik | `attemptService.checkEligibility` |
| `start_attempt` | `api.php:395` | POST | Publik | `attemptService.startAttempt` |
| `get_attempt` | `api.php:413` | GET | Token ujian | `attemptService.resumeAttempt` |
| `save_attempt_answers` | `api.php:421` | POST | Token ujian | `attemptService.saveAnswers` |
| `submit_result` | `api.php:430` | POST | Token ujian | `gradingService.finalizeAttempt` |
| `get_review` | `api.php:495` | GET | Token hasil | `reviewService.getReview` |
| `set_review_state` | `api.php:511` | POST | Guru | `reviewService.setVisibility` |
| `get_review_states` | `api.php:524` | GET | Guru | `reviewService.listStates` |
| `allow_retake` | `api.php:531` | POST | Guru | `retakeService.grantPermission` |
| `save_questions` | `api.php:547` | POST | Guru | `quizService.upsertQuiz, questionService.upsert` |
| `delete_result` | `api.php:625` | POST | Guru | `resultService.trashByStudentQuiz` |
| `delete_results` | `api.php:631` | POST | Guru | `resultService.trashSelected` |
| `get_students` | `api.php:636` | GET | Guru | `studentService.list` |
| `save_student` | `api.php:652` | POST | Guru | `studentService.upsert` |
| `delete_student` | `api.php:726` | POST | Guru | `studentService.trash` |
| `import_students` | `api.php:748` | POST | Guru | `studentImportService.validateAndImport` |
| `clear_results` | `api.php:814` | POST | Guru | `resultService.resetWithBackup` |
| `teacher_dashboard` | `api.php:824` | GET | Guru | `dashboardService.summaryAndMonitor` |
| `exam_analytics` | `api.php:831` | GET | Guru | `analyticsService.questionAnalysis` |
| `get_trash` | `api.php:838` | GET | Guru | `trashService.list` |
| `restore_trash` | `api.php:839` | POST | Guru | `trashService.restore` |
| `create_backup` | `api.php:841` | POST | Guru | `backupService.create` |
| `system_status` | `api.php:845` | GET | Guru | `healthService.diagnostics` |
| `request_extension` | `api.php:850` | POST | Token ujian | `extensionService.request` |
| `check_extension_requests` | `api.php:895` | GET | Guru | `extensionService.pending` |
| `approve_extension` | `api.php:903` | POST | Guru | `extensionService.approve` |
| `reject_extension` | `api.php:939` | POST | Guru | `extensionService.reject` |
| `check_extension_status` | `api.php:957` | GET | Token ujian | `extensionService.status` |
Nama path detail tersedia di tab **API 34 Action** pada Excel pendamping. Server tetap bisa menyediakan `?action=...` sebagai compatibility adapter sementara jika browser lama dijalankan berdampingan.

## 6. ERD / model data yang disarankan
Terdapat **17 tabel** operasional; detail kolom ada di Excel tab **Skema MySQL**. Penting:
- `quizzes 1:N questions 1:N question_options`; identitas soal stabil, indeks/urutan lama disimpan dalam kolom `legacy_index` saat migrasi.
- `attempts 1:N attempt_questions 1:N?` (jawaban disimpan per `attempt_id+question_position`), `attempts 1:1 exam_results`, `exam_results 1:N result_breakdowns`.
- `attempt_questions.snapshot_json` menyimpan soal+kunci+opsi saat mulai; response publik menyaring `answer/answers/explanation`, `review` menggunakan snapshot hasil setelah izin guru.
- `students.nis` nullable agar siswa tanpa NIS kompatibel; `nis_snapshot` dalam attempt/result tetap string untuk data historis. Rekonsiliasi siswa tanpa NIS dilakukan dengan ID internal, jangan memaksa NIS otomatis.
- `teacher_sessions` & `attempts` memakai **hash token** di DB; cookie guru HttpOnly/SameSite; token review juga hash. Foto/gambar berupa path/asset id, bukan Base64 blob dalam MySQL.
- **Retake permissions, extension requests, audit, trash dan backup metadata** tabel tersendiri; nilai lama dan daftar riwayat tidak boleh berubah saat migrasi.

## 7. Alur kritis setelah refactor
### A. Mulai ujian (transaksi)
`POST /api/ujian/mulai` -> validasi identitas, kuis ACTIVE/jadwal, token/PIN -> lock kuota retake/cek hasil -> buat random token (simpan SHA256) -> acak soal & opsi crypto-secure -> simpan snapshot soal+kunci dan `ends_at` atomik -> response tanpa kunci/pembahasan`.
### B. Simpan jawaban / resume
`GET sesi` mengembalikan soal/opsi urutan sama, jawaban saat ini, waktu server. `POST jawaban` menerima indeks posisi yang valid; gunakan `version`/sequence untuk mencegah request jaringan out-of-order menimpa jawaban terbaru. Debounce 500ms + interval 8s + offline localStorage **per attempt token** + retry/pending indicator; kunci jawaban tidak pernah dikirim.
### C. Submit (transaksi SERIALIZABLE atau SELECT ... FOR UPDATE)
`POST kumpulkan` -> lock attempt -> jika sudah SUBMITTED, kembalikan hasil idempotent -> ambil snapshot+kunci server -> translate indeks opsi -> aturan missing/time server -> hitung nilai di service murni -> simpan exam_results+breakdowns -> konsumsi kuota retake -> set status SUBMITTED -> commit -> kirim hasil dan token review`. Jam dihitung dari timestamp server, bukan decrement browser semata.
### D. Extension
`request` hanya untuk attempt aktif; status PENDING unik per attempt. Guru approve menit 1..batas tersetujui -> row lock -> `new_ends_at=max(now, ends_at)+minutes*60` -> status APPROVED dan audit. Tolak hanya dari PENDING. UI siswa poll 5 detik dan guru 10 detik (baseline), atau SSE opsional bila stabil di LAN.

## 8. Excel / Word: kompatibilitas yang tepat
- **Template soal Excel lama:** sheet pertama, 11 kolom tepat `tipe, pertanyaan, teks_kasus, pernyataan, alasan, opsi_a, opsi_b, opsi_c, opsi_d, kunci_jawaban, pembahasan`. Kunci MC/case `0..3`, complex `0,2`, cause_effect enum string, scaled default Likert 1..5; tetap didukung XLSX dan CSV. XLS lama kompatibilitas opsional tergantung parser yang disetujui.
- **Template siswa Excel lama:** sheet pertama `NO, INDUK, NAMA, KELAS`; `INDUK` bertipe TEXT dan boleh kosong; import upsert berdasarkan NIS bila ada, tolak duplikat dalam batch, simpan kelas & foto jika tersedia.
- **Template Word:** aplikasi **belum bisa import `.doc` / `.docx`**, meski bisa download HTML ber-ekstensi `.doc` dari `downloadWordTextTemplate()`. Target baru harus membuat `.docx` nyata serta mengimpor `.docx` dengan parser server misalnya `mammoth` (`extractRawText`) yang membaca label `TIPE:`, `PERTANYAAN:`, `KASUS:`, `PERNYATAAN:`, `ALASAN:`, `A:` s.d. `D:`, `KUNCI:`, `PEMBAHASAN:` dipisah baris `---`. Untuk scaled, gunakan label tambahan `SKALA_A..SKALA_E` + bobot. Tetap dukung `.txt` lama.
- **Semua impor:** file size cap, MIME+signature validation, sanitasi ZIP/XML, preview jumlah/invalid row, parse di server, transaksi all-or-none, laporan sukses & error per baris. Siapkan template Excel menurut lima tipe+campuran di UI (saat ini satu template campuran).
- File template pendamping dibuat dengan data contoh FIKTIF. **Template `.docx` baru baru akan berfungsi pada aplikasi refactor; jangan unggah ke importer PHP lama.**

## 9. Perbedaan/risiko ditemukan dari kode aktual
- **[Kritis] DB, backup & sessions dapat terekspos HTTP** — Tidak terlihat proteksi root pada ZIP; folder backups dan file db berada di web root. **Tindakan:** Pindahkan data rahasia di luar public; hanya Next API expose; URL tidak publik. *Sumber:* `api.php:27,72; guru/.htaccess`.
- **[Kritis] Skor kuis campuran + scaled salah** — Saat ada scaled, skor hanya menggunakan total poin scaled, MC tak menambah poin. **Tindakan:** Keputusan parity: baseline golden test + rumus skor campuran yang disetujui. *Sumber:* `api.php:216-265`.
- **[Kritis] force_submit dari klien dapat melewati soal wajib** — Server menganggap input.force_submit sebagai bypass. **Tindakan:** Otorisasi submit kosong hanya ketika waktu server habis atau kebijakan guru. *Sumber:* `api.php:458-461`.
- **[Tinggi] Submit/cadangan JSON rawan race/lost updates** — load->ubah->save file per request, LOCK_EX saat write tidak menjaga RMW. **Tindakan:** SQL transaction, row lock FOR UPDATE, unique & idempotency. *Sumber:* `api.php:46-66,395-493`.
- **[Tinggi] Data soal berubah selama ujian** — Attempt simpan urutan indeks, grading membaca versi kuis terkini. **Tindakan:** Snapshot soal/kunci versi saat start, immutable attempt. *Sumber:* `api.php:96-109,216-264,395-493`.
- **[Tinggi] Autosave tabrakan antar sesi** — localStorage jawaban global; bukan namespaced per token. **Tindakan:** Key per attempt; revision/version; autosave conflict safe. *Sumber:* `index.html:309-316,628-631`.
- **[Tinggi] Word template download bukan Word import** — Ekspor .doc HTML; importer hanya menerima txt/xlsx/xls/csv. **Tindakan:** Dukung .docx asli via mammoth + validasi, tetap txt lama. *Sumber:* `guru/index.html:2382-2480`.
- **[Tinggi] XSS lewat innerHTML yang memasukkan konten soal** — Question text/option dinamis dimasukkan ke string HTML. **Tindakan:** Gunakan React JSX escaping, sanitasi rich text. *Sumber:* `index.html:491-607; guru/index.html:1704-1755`.
- **[Tinggi] PHP teacher_status tidak memeriksa idle timeout** — Status hanya memeriksa flag auth; teacherOnly cek last activity. **Tindakan:** Satu pemeriksa sesi untuk status dan setiap endpoint. *Sumber:* `api.php:82-91,322-325`.
- **[Tinggi] Auth siswa hanya input NIS/nama/kelas** — Server tidak memvalidasi identitas terhadap daftar siswa. **Tindakan:** Putuskan mekanisme autentikasi sesuai kebutuhan; jangan ubah UX tanpa persetujuan. *Sumber:* `api.php:395-405`.
- **[Sedang] Data siswa nama/NIS kelas tersedia di endpoint publik** — get_student_data membagikan daftar siswa lengkap (3 field). **Tindakan:** Batasi metadata/lookup tanpa enumerasi seluruh siswa bila disepakati. *Sumber:* `api.php:328-352`.
- **[Sedang] Impor CSV sederhana tanpa escape quote** — split comma memecah teks berisi koma. **Tindakan:** Gunakan parser RFC4180, audit rows. *Sumber:* `guru/index.html:1553-1559`.
- **[Sedang] Impor Excel belum memvalidasi kunci/tipe** — parseInt(... )||0 mengganti invalid menjadi A. **Tindakan:** Validasi per baris dan preview errors; import atomic. *Sumber:* `guru/index.html:2483-2549`.
- **[Sedang] Hapus dipilih berbeda dari hapus satu** — delete_results tidak menyalin record ke trash. **Tindakan:** Samakan perilaku dengan trash dan audit, atau beri pilihan. *Sumber:* `api.php:625-634`.
- **[Sedang] Riwayat max lima menggunakan urutan array bukan waktu eksplisit** — Saat threshold tercapai menghapus matching terakhir. **Tindakan:** Deterministik ORDER BY submitted_at DESC, result id. *Sumber:* `api.php:466-487`.
- **[Sedang] Dashboard guru memuat kode siswa lama yang tidak aktif** — Guru halaman HTML menduplikasi handler siswa meski view tersembunyi. **Tindakan:** Port hanya root student; jangan menduplikasi kode. *Sumber:* `guru/index.html:903-1336; CSS awal`.
- **[Sedang] NIS guru max20 vs siswa max6** — Form peserta memotong enam digit, data guru bisa lebih. **Tindakan:** Tetapkan batas kompatibel dan migrasi tanpa memotong NIS lama. *Sumber:* `index.html:360-362,424-435; guru/data_siswa.html`.
- **[Sedang] Field homeroom historis tidak diisi ulang oleh form guru** — Ditemukan pada data, tidak ada field input di formulir baru. **Tindakan:** Pertahankan field saat migrasi, putuskan tampilkan di UI. *Sumber:* `db_kuis.json; guru/data_siswa.html`.
- **[Sedang] Hasil API dan tombol simpan mungkin menampilkan sukses sebelum selesai** — saveQuiz() tidak await saveQuestionsToAPI. **Tindakan:** Await mutation, tampilkan status setelah sukses saja. *Sumber:* `guru/index.html:1864-1902`.
- **[Sedang] Penolakan extension tidak memverifikasi pending & active** — reject_extension status diganti tanpa guards. **Tindakan:** State machine PENDING->APPROVED/REJECTED, transaction lock. *Sumber:* `api.php:903-955`.
- **[Sedang] Repo frontend bergantung CDN** — Tailwind, FontAwesome, Font Google, SheetJS CDN. **Tindakan:** Bundle Tailwind JS CSS/icon/font secara lokal untuk LAN offline. *Sumber:* `index.html:7-14; guru/index.html:7-14`.
- **[Rendah] game React TSX terpisah tidak tersambung** — pahlawan_office.tsx mandiri, tidak dipanggil halaman utama. **Tindakan:** Tetapkan optional /game, port ke JavaScript kalau diaktifkan. *Sumber:* `pahlawan_office.tsx:1-592`.

## 10. Tahapan pengerjaan yang tidak boleh dilompati
0. **Freeze aplikasi lama:** Salin db JSON, backup & uploads; inventory; hash; golden test. **Gate:** Artefak aman dan output PHP jadi referensi. *Catatan:* Jangan migrasi langsung tanpa backup.
1. **Fondasi Next JS:** Next.js App Router JavaScript .js, Tailwind build, mysql2/promise, auth. **Gate:** Bisa offline, satu server LAN, akses guru/siswa. *Catatan:* Jangan pilih TypeScript/Golang.
2. **Schema & migrasi:** Migrations MySQL, import legacy JSON dry-run/idempotent, media. **Gate:** Counts data + relasi + checksum match. *Catatan:* Cadangan mentah tidak dimutasi.
3. **Engine ujian:** start/resume/shuffle/answers/timer/submit/grading/results. **Gate:** Golden test 5 jenis & mixed. *Catatan:* Prioritas tertinggi.
4. **UI siswa paritas:** NIS, paket, PIN, soal, sidebar, timer, autosave, hasil. **Gate:** Flow refresh/offline dan modal sama. *Catatan:* Tampilan awal sebagai visual baseline.
5. **UI guru inti:** Login, kuis, soal, siswa, hasil, retake, review, extension. **Gate:** CRUD dan status sama. *Catatan:* Hapus duplikasi kode siswa di guru.
6. **Excel & Word:** Impor Excel/CSV TXT legacy dan DOCX baru, templating & ekspor. **Gate:** Data validasi/preview & template uji. *Catatan:* Word .docx fitur BARU.
7. **Operasional:** Monitoring, analytics, audit, backups, trash, server health. **Gate:** Server LAN siap produksi. *Catatan:* Load test 50-100 koneksi.
8. **UAT & cutover:** Replay/parity matrix, staging, freeze writes, migrate, smoke test, rollback. **Gate:** Semua P0 PASS lalu go-live. *Catatan:* Pertahankan aplikasi lama read-only sebagai fallback.

## 11. Acceptance tests minimum (golden/parity)
Di workbook Excel pendamping terdapat 33 skenario beserta ID, perilaku baseline dan kriteria selesai. Jalankan browser regression dengan Playwright dan API/integration test menggunakan Node test runner/Vitest, serta load tests untuk request jawaban paralel.

## 12. Aturan keputusan parity — wajib terdokumentasi sebelum coding
- **P0 MUST MATCH:** UI dan flow siswa, lima tipe soal, hasil benar/salah, stok token, perpanjangan waktu, retake, review, autosave/resume, login guru, export dan import file yang memang berjalan saat ini.
- **P0 BUG FIX WITH APPROVAL:** rumus mixed+scaled, bypass force_submit, stale session, race save, validasi siswa. Simpan angka historis apa adanya dan buat adapter legacy untuk perbandingan.
- **P1 FEATURE ADDED:** impor Word `.docx` sesungguhnya, pemilihan template per tipe, validasi CSV, granular API/CRUD, monitoring stabil. Jangan klaim fitur ini sudah ada di aplikasi lama.
- **OUT OF SCOPE OPTIONAL:** `pahlawan_office.tsx` game mandiri, kecuali ditetapkan sebagai menu aplikasi.

## 13. Prinsip migrasi dan cutover
1. Arsipkan `db_kuis.json`, `backups/*.json`, `uploads/soal/*`, dan simpan checksum SHA256; backup di lokasi privat, bukan web root.
2. Import **snapshot db aktif sekali** ke MySQL. Mapping `legacy_id` & `legacy_question_index` deterministik. Jangan memuat tiap backup sebagai duplikat. Scan histori terpisah bila perlu pemulihan.
3. Perbaiki `homeroom` yang ada secara historis dan pertahankan `teacher_password_hash` yang valid; uji verifikasi bcrypt kompatibel `$2y$` di Node; jangan reset password tanpa kebijakan.
4. Buat perbandingan counts dan sample sanitized: 2 kuis, 43 soal, 25 siswa, 2 hasil, 5 attempts, 2 extension, 46 audit sebelum pindah; file backup bisa berisi data dari waktu berbeda.
5. Lakukan dry-run idempotent, UAT paritas, freeze write PHP, migrasi final, tes LAN dari client nyata, rollback plan tetap siap.

## 14. Peta file dan audit ringkas artefak lain
| Path | Peran | Strategi |
|---|---|---|
| `index.html` | SPA peserta; 39 fungsi; soal dan time-out | pecah komponen siswa/hooks |
| `guru/index.html` | SPA guru; 81 fungsi, sebagian siswa duplikat mati | pecah route guru/components; abaikan duplikasi siswa |
| `guru/data_siswa.html` | form & tabel siswa di-fetch sebagai HTML | ubah ke komponen React yang render langsung |
| `api.php` | 34 action + 15 helper, seluruh logic | peta route/service transaction |
| `db_kuis.json` | live JSON data/akun/hasil | impor satu kali; rahasiakan |
| `backups/*.json` | 18 historical snapshots | arsip, bukan tabel live |
| `uploads/soal/*` | 3 gambar soal | pindahkan aset & perbaiki path |
| `sessions/*` | sesi PHP asli | tidak port; login ulang dalam sesi Next |
| `guru/.htaccess` | `Require local` untuk halaman guru | security lewat Next server; allowlist LAN opsional |
| `docs/project-map/*` | 10 dokumen + checkpoint lama | sebagai referensi sekunder; beberapa fitur extension hilang |
| `README.txt` | penggunaan lama | update dokumentasi operasional |
| `UPGRADE_PROMPT.txt` | usulan/permintaan peningkatan panjang | jangan anggap fitur sudah diimplementasikan |
| `catatan PR.txt` | daftar PR lama, beberapa FIX | cross-check final |
| `isi file checkpoint.txt` | ringkasan audit lama | bukan runtime |
| `api_fase1.php` | fragmen tidak valid sebagai controller | jangan port |
| `tes_gemini.js` | eksperimen JS | jangan port |
| `pahlawan_office.tsx` | game React mandiri | modul opsional /game, konversi JS bila dipilih |

**Definisi selesai:** Bukan hanya tampilan mirip. Semua **P0 PASS** pada fixture data/simulasi jaringan, seluruh 34 action terpetakan, 5 tipe soal tervalidasi, MySQL ACID, dan file Excel/Word berjalan sesuai kontrak masing-masing.
