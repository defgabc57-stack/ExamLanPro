# Patch ExamLAN — Fix Origin 403 + quizzes.subject (Next.js 3001 / XAMPP 3306)

Paket ini berisi hanya file sumber yang perlu diperbarui pada proyek ExamLAN dari paket sebelumnya.

1. Backup folder kode aplikasi Anda. Jangan hapus `.env.local`, folder `public/uploads`, atau database MySQL.
2. Ekstrak semua isi ZIP patch **ke folder akar proyek Anda** (yang berisi `package.json` dan `src`), dengan izin overwrite file source yang sama.
3. Cek `.env.local` sudah menunjuk ke `DB_PORT=3306`, `APP_URL=http://localhost:3001` dan kredensial MySQL yang benar.
4. Hentikan server Next.js lama (Ctrl+C), lalu jalankan `npm run db:check`, `npm run db:repair`, dan `npm run dev` dari direktori proyek.
5. Masuk ke `http://localhost:3001/guru/login`. Bila muncul password salah (bukan Origin 403), reset menggunakan `npm run admin:reset` dengan environment `ADMIN_USERNAME`/`ADMIN_PASSWORD` baru (lihat README utama).
6. Halaman siswa baru menampilkan paket apabila guru sudah membuat paket soal dengan status `ACTIVE` dan jadwalnya masih berlaku.

Patch tidak menghapus tabel atau data. `db:repair` hanya menambah `quizzes.subject` jika kolom itu belum ada. Pemeriksaan origin tetap menolak origin yang bukan milik server.
