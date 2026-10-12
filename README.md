# ExamLAN Pro — Next.js JavaScript + Tailwind + MySQL

Implementasi awal *berfungsi secara desain dan kode* berdasarkan `Peta_Refactor_ExamLAN.md`, bukan sekadar gambar dashboard. Paket sumber PHP `kuis.zip` **tidak disertakan** pada input kali ini sehingga kesamaan pixel, kompatibilitas payload legacy dan migrasi data asli **belum dapat diverifikasi**. Jangan langsung menggantikan aplikasi produksi sebelum UAT.

## Modul yang diimplementasikan

- Peserta: kode akses pribadi dari guru, pilih kuis aktif sesuai kelas, PIN, cek izin retake, mulai sesi, acak soal dan pilihan, 5 tipe, timer, autosave 500 ms / 8 detik, restore token per perangkat, submit server-side, hasil, polling review / perpanjangan.
- Guru: login bcrypt (hash PHP `$2y$` kompatibel), ganti password awal, idle timeout 30 menit, dashboard monitoring, editor kuis + soal + gambar, CRUD siswa + foto, validasi impor, rekap hasil CSV/XLSX, izin retake, review, persetujuan/penolakan extension, analitik, audit, soft-deletion ke trash, backup privat & reset hasil.
- File: template XLSX siswa/soal & DOCX asli disertakan; ekspor soal DOCX dari aplikasi, impor XLSX/CSV/TXT/DOCX dengan validasi dan pratinjau (impor Word bukan fitur PHP lama).
- Storage: MySQL InnoDB dari 17 tabel asli + migrasi kunci jawaban, snapshot soal pada awal attempt, token di-hash SHA256 dan session guru HttpOnly.

## Persyaratan

- Node.js **20.9+** (disarankan 22 LTS); Next.js 15, JavaScript `.js` tanpa `.ts`/`.tsx`.
- MySQL 8.0+ (XAMPP MariaDB mungkin berbeda; lebih aman MySQL 8). Gunakan akun DB dengan permission `CREATE/ALTER` hanya saat migrasi; kurangi privilege untuk runtime.
- Internet **hanya saat `npm ci` awal**. Setelah paket terpasang dan dibangun, font/icon/CSS berjalan lokal tanpa CDN.

## Konfigurasi XAMPP port 3306 dan Next.js port 3001

Paket ini **sudah disetel** agar perintah `npm run dev` dan `npm run start` menjalankan Next.js di `http://localhost:3001`; konfigurasi contoh `.env.example` mengarah ke MySQL XAMPP pada port **3306**. Apache XAMPP boleh tetap memakai port 80/443 karena Next.js tidak bergantung pada Apache.

Sebelum menjalankan Node.js, pastikan modul **MySQL** berstatus aktif di XAMPP dan port MySQL yang sesungguhnya adalah 3306. Di Control Panel XAMPP, Anda dapat memeriksa konfigurasi `my.ini` bagian `[mysqld]` dan `[client]`. Bila masih 3306, sesuaikan konfigurasi XAMPP dengan hati-hati dan restart MySQL, atau ubah `DB_PORT` sesuai port aktual. PhpMyAdmin hanya alat administrasi database; browser aplikasi ExamLAN dibuka di port 3001.

### Pilihan A — Next.js berjalan di Windows, MySQL di XAMPP Windows

```powershell
cd C:\path\ke\examlan-nextjs
Copy-Item .env.example .env.local
# Sesuaikan user/password XAMPP, DB_HOST=127.0.0.1, DB_PORT=3306
npm.cmd install
npm.cmd run db:check
npm.cmd run db:init
$env:ADMIN_USERNAME='admin'
$env:ADMIN_PASSWORD='GantiDenganPasswordKuat123!'
npm.cmd run admin:create
npm.cmd run dev
```

Gunakan `npm.cmd` di PowerShell jika kebijakan eksekusi Windows memblokir `npm.ps1`. Jika memakai Command Prompt biasa, `npm` juga dapat digunakan. XAMPP lokal sering menggunakan `root` tanpa kata sandi, tetapi hal itu **hanya boleh untuk pengembangan lokal**; gunakan akun khusus dan kata sandi untuk penggunaan LAN.

### Pilihan B — Next.js berjalan di WSL, MySQL di XAMPP Windows

WSL2 dengan NAT dan MySQL di Windows dapat memerlukan alamat host Windows, tidak selalu `127.0.0.1`. Temukan dari WSL:

```bash
ip route | awk '/default/ {print $3}'
```

Salin `.env.wsl-xampp.example` ke `.env.local`, ubah `DB_HOST=WINDOWS_HOST_IP` menjadi alamat hasil perintah di atas, dan sesuaikan user/password. Jika konfigurasi WSL menggunakan mirrored networking, koneksi ke `127.0.0.1` dapat bekerja; gunakan `npm run db:check` untuk mengujinya. Koneksi lintas WSL NAT bisa membutuhkan penyesuaian `bind-address` MySQL, izin akun database untuk host WSL, dan aturan Windows Firewall yang dibatasi ke jaringan privat/WSL saja. **Jangan membuka port 3306 ke internet.**

```bash
cp .env.wsl-xampp.example .env.local
nano .env.local
npm ci
npm run db:check
npm run db:init
ADMIN_USERNAME=admin ADMIN_PASSWORD='GantiDenganPasswordKuat123!' npm run admin:create
npm run dev
```

### Alamat setelah dijalankan

- Siswa: `http://localhost:3001/`
- Guru: `http://localhost:3001/guru/login`
- XAMPP MySQL: host sesuai `.env.local`, port TCP `3306`

## Instalasi di WSL Ubuntu (direkomendasikan)

```bash
unzip examlan-nextjs.zip -d ~/projects
cd ~/projects/examlan-nextjs
cp .env.example .env.local
nano .env.local
npm ci
npm run db:check
npm run db:init
ADMIN_USERNAME=admin ADMIN_PASSWORD='GantiDenganPasswordKuat123!' npm run admin:create
npm test
npm run dev
```

**Catatan database:** default file `.env.example` memakai `DB_USER=examlan_app`, tetapi akun ini harus dibuat di MySQL lebih dahulu atau ganti sementara ke akun MySQL yang memiliki hak migrasi. Contoh SQL (jalankan sebagai root MySQL, ganti sandi):

```sql
CREATE USER IF NOT EXISTS 'examlan_app'@'%' IDENTIFIED BY 'PASSWORD_DB_YANG_PANJANG';
GRANT ALL PRIVILEGES ON examlan.* TO 'examlan_app'@'%';
FLUSH PRIVILEGES;
```

Pada beberapa MySQL, database mesti dibuat dahulu oleh root agar GRANT dapat diterapkan:

```sql
CREATE DATABASE IF NOT EXISTS examlan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Bila menggunakan MySQL Windows/XAMPP dari WSL, cari alamat host Windows lewat `ip route | awk '/default/ {print $3}'`, lalu isikan alamat tersebut ke `DB_HOST`. Pastikan MySQL listen pada interface yang dapat diakses dan user host MySQL diizinkan; jangan membuka port 3306 ke jaringan publik. Alternatif yang lebih sederhana: MySQL 8 jalan langsung di WSL dan `DB_HOST=127.0.0.1`.

Next.js memakai **port 3001**, tidak memakai port Apache XAMPP **80/443**. Keduanya tidak bentrok. Untuk client LAN gunakan `http://IP-LAN-SERVER:3001`. Buka TCP 3001 di firewall lokal jika diperlukan.

- Portal siswa: `http://localhost:3001/`
- Portal guru: `http://localhost:3001/guru/login`

Saat `npm run dev`, guru pertama yang dibuat harus mengganti password saat masuk. Jangan bagikan akun ini ke siswa.

## Build untuk LAN

```bash
npm run build
npm run start
```

`npm run start` harus dijalankan dari direktori proyek agar server membaca `templates/`. Gunakan PM2/systemd untuk restart otomatis. HTTPS/TLS dan proxy perlu saat server diakses di luar LAN. `APP_URL=https://...` mengaktifkan cookie `Secure`.

## Panduan operasional singkat

1. Masuk portal guru, ubah sandi pertama.
2. `Data Siswa` — isi manual atau download template Excel, pratinjau, impor. Siswa yang dibuat manual mendapat kode akses sekali saat disimpan. Untuk siswa lama/hasil impor, klik `Buat Kode Akses`. Berikan kode hanya kepada siswa tersebut; `Ganti Kode Akses` membatalkan kode lama.
3. `Paket & Soal` — buat kuis, tambah lima jenis soal atau impor file, aktifkan `ACTIVE`, simpan.
4. Portal siswa — masukkan kode akses pribadi, pilih paket, mulai ujian, submit ketika selesai. Identitas berasal dari daftar siswa; NIS boleh kosong.
5. Guru — lihat hasil, buka review, beri izin retake / extension bila diperlukan, ekspor laporan.
6. `Operasional` — backup terjadwal dari luar aplikasi, periksa log, jangan simpan backup di lokasi publik.

## Catatan paritas dan batas pengujian

- Keputusan implementasi pada skor soal **campuran + scaled**: tiap butir bobot setara; perhitungan normalized per item. Ini memperbaiki bug rumus historis (bagian scaled mengabaikan soal non-scaled), **tidak otomatis mengubah nilai lama**.
- Riwayat percobaan dan izin retake memakai ID siswa stabil, termasuk siswa tanpa NIS. Mengganti nama, NIS, kelas, atau kode akses tidak memberi jatah ujian baru. Penghapusan hasil tidak menghapus riwayat percobaan; beri izin retake secara eksplisit jika siswa perlu mengulang.
- Impor dalam satu transaksi; pratinjau tidak mengubah DB. File Excel dan Word di folder `templates/` adalah template contoh fiktif.
- Source PHP dan `db_kuis.json` **belum diunggah** di paket pemetaan ini. Untuk migrasi semua 25 siswa/43 soal/hasil historis secara presisi, sumber JSON asli & golden test PHP diperlukan; migrasi data historis belum termasuk pada build ini.
- Tes regresi dan integrasi MySQL/API tersedia; hasil pemeriksaan cloud dijelaskan di `FIXES_AUDIT.md`. Uji beban 50–100 klien dan UAT pada perangkat sekolah tetap perlu dilakukan.
- Jangan expose `storage/private`, `.env.local` atau MySQL ke internet. Backup JSON belum dienkripsi; atur izin akses OS.
- 34 action lama menjadi endpoint domain baru; adapter kompatibilitas `?action=...` dari PHP **belum diterapkan**, sehingga klien PHP lama tidak boleh diarahkan ke endpoint baru tanpa migrasi UI.
- `pahlawan_office.tsx` tidak dibangun karena bersifat game terpisah, bukan alur ujian utama.

## Format impor dan keamanan parser

Excel menggunakan ExcelJS; paket `xlsx` lama dan Mammoth sudah dihapus. Impor mendukung `.xlsx`, `.csv`, `.txt`, dan `.docx` sesuai jenis data. File `.xls` lama harus disimpan ulang sebagai `.xlsx` atau CSV menggunakan Excel/LibreOffice. Parser biner berjalan di proses terpisah dengan batas waktu 15 detik, heap 192 MB, dan maksimal dua parser aktif per proses server. Arsip dibatasi 30 MB setelah dekompresi. Gunakan `npm ci` untuk memasang versi dari lockfile; jangan menyalin `node_modules` versi lama.

## Perbaikan 11 Oktober 2026: gagal login Origin 403 & subject MySQL

Perbaikan ini mempertahankan port Next.js **3001** dan port MySQL XAMPP **3306**.

- `Origin tidak diizinkan` dari API POST ditangani dengan membandingkan header `Origin` terhadap `Host` yang diakses oleh browser (bukan alamat internal `req.url` yang bisa berisi `0.0.0.0`). Origin yang tidak cocok tetap ditolak 403. APP_URL masih digunakan untuk reverse proxy HTTPS.
- `Unknown column 'subject' in 'field list'` terjadi bila database MySQL telah punya tabel `quizzes` versi lama. `CREATE TABLE IF NOT EXISTS` tidak memperbarui kolom. Jalankan **`npm run db:repair`** untuk mengecek dan menambah hanya `quizzes.subject` bila belum ada, tanpa menghapus tabel atau data. Perintah ini aman diulang. `npm run db:init` sekarang juga melakukan pemeriksaan yang sama setelah migrasi selesai.

Setelah menggabungkan file perbaikan ke folder proyek (pertahankan `.env.local`, berkas yang diunggah, serta database lokal), jalankan:

```bash
npm run db:check
npm run db:repair
npm run dev
```

Jika memakai PowerShell, dapat gunakan `npm.cmd run db:repair`. Hentikan proses Next.js yang lama sebelum menjalankan ulang. Anda tidak perlu membuat ulang database atau akun admin jika akun sudah ada.

Password guru tidak disetel otomatis: username `admin` dan password yang benar bergantung pada perintah `ADMIN_PASSWORD=... npm run admin:create` yang benar-benar sudah dijalankan. Password kosong tidak didukung. Saat Origin bermasalah, sistem belum memverifikasi kata sandi apa pun.

Bila setelah Origin diperbaiki ternyata kata sandi salah, Anda **tidak perlu menghapus database**. Reset sandi admin yang telah ada dari terminal pada folder proyek:

```powershell
$env:ADMIN_USERNAME='admin'
$env:ADMIN_PASSWORD='SandiBaruYangKuat123!'
npm.cmd run admin:reset
```

Untuk CMD (`set ADMIN_USERNAME=admin`, `set ADMIN_PASSWORD=...`) dan WSL/Linux (`ADMIN_USERNAME=admin ADMIN_PASSWORD='...' npm run admin:reset`), sesuaikan sintaks environment. Reset ini akan memaksa guru mengganti sandi saat login berikutnya dan mengeluarkan sesi guru lama.

## Validasi

```bash
npm test
npm run build
```

Tes `node:test` tersedia untuk 5 tipe, normalisasi opsi teracak, campuran scaled, hash dan validasi integer. Tes memerlukan dependency yang dapat diunduh di mesin pengembang untuk fungsi server dan UI.

## Struktur

- `src/app/` — halaman siswa/guru dan API domain.
- `src/lib/exam.js` — transaksi attempt, autosave, submit, review & extension.
- `src/lib/grading.js` — mesin skor murni untuk 5 tipe.
- `src/lib/quizzes.js`, `admin.js`, `importers.js`, `auth.js` — layanan.
- `db/migrations/` — schema 17 tabel dan kunci soal.
- `templates/` — peta + matriks parity + template Word/Excel dari paket pengguna.
- `tests/` — unit test.
