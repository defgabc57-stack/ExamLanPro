# Perbaikan audit 12 Oktober 2026

Perubahan memperbaiki sebelas temuan audit pada commit dasar `d7c05ab0c1b363f63756cd68b52557c38db45c44`.

## Perubahan perilaku

1. Autosave memakai counter yang diteruskan dari revisi server saat resume. Server menerima revisi safe integer, termasuk format browser lama, dan tetap mengabaikan request dengan revisi lebih rendah. Cache lokal ditulis saat jawaban diubah; kegagalan request tidak menimpa cache dengan jawaban yang lebih lama.
2. Soal skala yang kosong/invalid bernilai nol. Indeks 0 tetap merupakan jawaban valid; array/objek tidak diubah menjadi indeks angka.
3. Peserta harus terdaftar dan memakai kode akses acak 256 bit yang hanya disimpan sebagai hash. Guru membuat/mengganti kode di Data Siswa. Nama/NIS/kelas dari request tidak dipercaya. Lookup NIS anonim telah dihapus. Kelas kuis diperiksa server.
4. Paket SheetJS lama dan Mammoth dihapus. XLSX memakai ExcelJS; DOCX memakai ZIP dan XML parser dengan pembatasan ukuran, memori, waktu, dan paralelisme. `.xls` harus dikonversi ke `.xlsx` atau CSV. Ekspor Excel tetap tersedia dan teks yang diawali `=` disimpan sebagai teks, bukan formula.
5. Browser mengirim jadwal dengan ISO UTC; server menolak jadwal tanpa zona waktu. Jadwal 08:00 Asia/Jakarta tersimpan sebagai 01:00 UTC.
6. Analitik dikelompokkan berdasarkan paket dan snapshot soal/versinya; posisi acak peserta tidak digunakan sebagai identitas soal.
7. Backup versi 2 memuat metadata dan isi media dengan checksum. Data tabel dibaca dalam satu snapshot transaksi. Pemulihan ke database kosong disediakan; sesi guru dan rate limit tidak dipulihkan. Backup lama versi 1 tetap dapat disimpan sebagai arsip, tetapi bukan backup penuh untuk perintah restore baru.
8. Perubahan password mengunci akun, mencabut semua sesi lama, lalu menerbitkan sesi baru untuk browser yang mengubah password. Login dan perubahan password memakai lock akun yang sama untuk mencegah sesi dengan password lama dibuat setelah pencabutan.
9. Batas percobaan login disimpan dalam database berdasarkan akun, termasuk variasi kapitalisasi username. Header IP request tidak dipercaya. PIN ujian juga dibatasi berdasarkan peserta dan paket. Bucket kedaluwarsa dibersihkan.
10. Retake dan riwayat attempt memakai ID siswa stabil, termasuk siswa tanpa NIS. Mengganti identitas/kode atau menghapus hasil tidak memberi retake otomatis.
11. Mock dan tes migrasi menguji kedua kolom `subject`/`class_name` secara terpisah. Port default migrasi, repair, pemeriksaan, dan runtime adalah 3306. Instalasi memakai `package-lock.json` dan `npm ci`.

Tailwind diperbarui ke versi 4; konfigurasi warna dan komponen dipertahankan. PostCSS dan UUID transitif dipasang pada versi yang ditambal; tidak ada override yang menghapus pemeriksaan keamanan. Gunakan browser modern yang didukung Tailwind 4 (Chrome 111+, Safari 16.4+, Firefox 128+).

## Menerapkan pada instalasi yang sudah ada

Hentikan proses Next.js, cadangkan database dan direktori `public/uploads` serta `storage/private`, lalu perbarui source. Pertahankan `.env.local`, database, dan media Anda. Jalankan dari direktori proyek:

```bash
npm ci
npm run db:check
npm run db:init
npm test
npm run build
npm run start
```

Pastikan `DB_PORT` menunjuk port MySQL sebenarnya. Migrasi menambah kolom/tabel secara idempoten tanpa menghapus data; `db:repair` juga menjalankan upgrade keamanan. DDL MySQL tidak dapat di-rollback sebagai transaksi, sehingga cadangan sebelum upgrade tetap diperlukan.

Setelah upgrade, guru perlu membuat kode akses untuk siswa lama/hasil impor. Kode ditampilkan sekali dan harus diberikan secara pribadi. Izin retake lama berbasis NIS dimigrasikan ke siswa yang terdaftar. Attempt lama tanpa NIS dipetakan lewat ID siswa yang sudah tersimpan atau pasangan nama/kelas unik. Identitas lama yang tidak bisa dipetakan dengan aman tetap disimpan sebagai riwayat legacy; jangan menebak pemiliknya. Periksa kasus tersebut sebelum ujian berikutnya.

Nilai historis tidak dihitung ulang otomatis. Tinjau hasil lama yang mungkin terdampak autosave gagal atau penilaian scaled kosong sebelum digunakan sebagai nilai resmi.

## Backup dan pemulihan

Backup dibuat melalui menu Operasional. Simpan JSON di tempat privat: berkas memuat hash password, identitas siswa, hash kode akses, dan hasil ujian. Untuk restore, gunakan database baru yang kosong dan sudah dimigrasi serta direktori proyek pemulihan terpisah. Jangan arahkan restore ke database produksi yang masih berisi data.

```bash
DB_NAME=examlan_restore npm run db:init
DB_NAME=examlan_restore npm run backup:restore -- /lokasi/backup-versi-2.json
```

Pemulihan menolak database yang sudah berisi data, memvalidasi checksum dan path media, menjaga foreign key tetap aktif, dan tidak menimpa file media yang berbeda. Jika insert gagal, transaksi tabel dibatalkan dan file baru dari operasi itu dibersihkan. Siswa memakai kode yang terakhir diberikan; guru perlu login ulang.

## Pemeriksaan regresi

`npm test` menjalankan tes unit dan impor. `npm run build` diperlukan sebelum tes integrasi HTTP.

Tes integrasi memerlukan MySQL lokal terpisah; tes hanya membuat dan menghapus database baru bernama `examlan_test_*`, tidak memakai `DB_NAME` aplikasi. Contoh untuk database sementara:

```bash
docker run -d --name examlan-test-mysql -p 127.0.0.1:13306:3306 -e MYSQL_ALLOW_EMPTY_PASSWORD=yes mysql:8.4
# Tunggu hingga mysqladmin ping sukses:
docker exec examlan-test-mysql mysqladmin ping
EXAMLAN_INTEGRATION=1 TEST_MYSQL_PORT=13306 npm run test:integration
docker rm -f examlan-test-mysql
```

Database contoh hanya untuk tes di loopback. Untuk server tes dengan password, sediakan `TEST_MYSQL_PASSWORD` melalui environment, bukan source.

Tes integrasi mencakup autentikasi peserta, identitas palsu, kelas, revisi browser lama, autosave/resume, submit idempotent, submit setelah tenggat, retake siswa tanpa NIS, kode yang dirotasi, start paralel, analitik, upgrade ulang, backup/restore media, pencabutan sesi guru, rate limit dengan header palsu, serta parser pada build produksi.

## Hasil pemeriksaan cloud

- Instalasi bersih `npm ci`: berhasil.
- `npm test`: 37 tes lulus, 0 gagal.
- Integrasi MySQL 8.4 dan API produksi: 14 tes lulus, 0 gagal.
- Build produksi Next.js 15.5.27: berhasil.
- `npm audit`: 0 kerentanan pada lockfile yang diuji.
- Chromium: autosave, reload/resume, submit nilai 100, CSS Tailwind, login guru, pembuatan siswa tanpa NIS dengan kode akses, dan jadwal Asia/Jakarta lulus tanpa pageerror. Jadwal 08:00–09:00 diperiksa di database sebagai 01:00–02:00 UTC.
- `git diff --check`: berhasil.

Tidak ada deploy/push atau perubahan database produksi yang dilakukan. Database dan server sementara untuk pengujian dihentikan setelah pemeriksaan. UAT dan uji beban pada instalasi sekolah belum dilakukan.
