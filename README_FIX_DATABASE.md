# Perbaikan skema database ExamLAN (XAMPP 3307 / Next.js 3001)

Patch ini memperbaiki kesenjangan antara file `db/migrations/001_init.sql` dengan tabel MySQL yang sebenarnya, terutama `quizzes.duration_minutes`, `quizzes.updated_at`, `exam_results`, `time_extension_requests`, dan `trash_items`. Script melakukan introspeksi 17 tabel dari skema resmi ExamLAN dan tidak memakai DROP, TRUNCATE, DELETE, atau reset database.

## Folder tujuan

Ekstrak/replace isi ZIP langsung di `C:\xampp\htdocs\ExamLanPro`:

- `scripts/full-schema-repair.js` **file baru**
- `scripts/repair-db.js` **ganti file lama**
- `scripts/migrate.js` **ganti file lama**
- `tests/full-schema-repair.test.js` file uji opsional

`db/migrations/001_init.sql` yang sudah ada pada proyek dipakai sebagai skema kanonik. Jangan mengganti `.env.local`, akun admin, atau data MySQL.

## Langkah

1. Backup `examlan` via phpMyAdmin (Export > SQL). Penting: DDL MySQL melakukan auto-commit.
2. Hentikan server (`Ctrl+C`).
3. Pastikan `.env.local` berisi `DB_HOST=127.0.0.1`, `DB_PORT=3307`, `DB_NAME=examlan` (sesuaikan user/password bila berbeda).
4. Jalankan dari folder `C:\xampp\htdocs\ExamLanPro`:

```powershell
node .\scripts\repair-db.js
# Boleh juga npm.cmd run db:repair jika script terdaftar di package.json.
npm.cmd run dev
```

5. Buka `http://localhost:3001` serta `http://localhost:3001/guru/login`.
6. Jalankan kembali `node .\scripts\repair-db.js`; seharusnya 0 tabel/kolom ditambahkan pada proses kedua.

## Hasil yang diharapkan

```text
Target: examlan pada MySQL port 3307
CREATE exam_results
CREATE time_extension_requests
CREATE trash_items
ADD quizzes.duration_minutes
ADD quizzes.updated_at
SELESAI: ... tabel dibuat, ... kolom ditambah.
```

Nama/urutan baris berbeda sesuai kondisi database. Kolom lama yang sudah ada tidak diubah.

### Peringatan

- `quizzes.duration_minutes` yang belum tersedia ditambahkan dengan **default 60 menit**; cek durasi paket ujian lama satu per satu.
- Jika tipe PRIMARY KEY tabel lama, contoh `quizzes.id INT`, berbeda dari skema baru `BIGINT UNSIGNED`, patch **sengaja berhenti** sebelum mengubah PK karena foreign key berisiko rusak. Catat error dan kirim `SHOW CREATE TABLE quizzes;` untuk migrasi data terarah.
- Jika tabel lama berisi data tetapi kolom wajib seperti `title` tidak ada, patch berhenti daripada mengarang nilai lama.
- Ini hanya memeriksa keberadaan kolom dan tabel, **bukan** menyamakan semua tipe kolom, indeks, atau relasi dari database PHP lama. Pengujian aplikasi tetap diperlukan.
- Jika database lama ternyata memakai desain berbeda dan Anda tidak perlu mempertahankan data lama, alternatif yang aman adalah membuat database **baru** (`examlan_baru`) dan mengubah `DB_NAME`, kemudian jalankan `npm.cmd run db:init`. Jangan DROP database asli.
