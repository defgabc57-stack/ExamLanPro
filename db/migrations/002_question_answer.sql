-- Penyimpanan kunci cause-effect dan konfigurasi jawaban saat menyunting soal.
ALTER TABLE questions ADD COLUMN answer_code VARCHAR(255) NULL;
