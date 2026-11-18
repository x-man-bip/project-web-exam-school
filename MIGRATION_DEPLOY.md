# Panduan Migrasi Database ke Supabase Baru & Deployment ke Vercel

Panduan lengkap untuk memindahkan aplikasi Ujian Sekolah (CBT) dari environment bawaan Bolt.new ke akun Supabase pribadi Anda dan men-deploy-nya ke Vercel untuk production.

---

## Daftar Isi

1. [Migrasi Database ke Supabase Baru](#1-migrasi-database-ke-supabase-baru)
2. [Penyesuaian Environment Variables & Koneksi](#2-penyesuaian-environment-variables--koneksi)
3. [Deployment ke Vercel](#3-deployment-ke-vercel)
4. [Optimasi Skala Ujian Sekolah](#4-optimasi-skala-ujian-sekolah-high-traffic)
5. [Smoke Test Checklist](#5-smoke-test-checklist-sebelum-ujian)

---

## 1. Migrasi Database ke Supabase Baru

### 1.1. Buat Project Supabase Baru

1. Buka [supabase.com](https://supabase.com) → login dengan akun pribadi Anda.
2. Klik **New Project**.
3. Isi:
   - **Name**: `ujian-sekolah` (atau nama sekolah Anda).
   - **Database Password**: buat password kuat, simpan di tempat aman.
   - **Region**: pilih yang terdekat dengan siswa (untuk Indonesia: `Southeast Asia (Singapore)`).
   - **Plan**: **Pro Plan** direkomendasikan untuk ujian (lihat catatan di Bagian 4).
4. Klik **Create new project**. Tunggu ± 2 menit hingga provisioning selesai.

### 1.2. Jalankan Migrasi SQL (Via SQL Editor — Cara Paling Cepat)

Folder `supabase/migrations/` berisi 34 file `.sql` yang harus dijalankan **berurutan**.

#### Opsi A: Via Supabase Dashboard (Rekomendasi untuk pemula)

1. Buka project Supabase baru Anda.
2. Buka menu **SQL Editor** (sidebar kiri).
3. Klik **+ New query**.
4. **Salin seluruh isi** setiap file `.sql` dari folder `supabase/migrations/` (mulai dari yang paling lama: `20261105033250_001_initial_schema.sql`) dan paste ke SQL Editor.
5. Klik **Run** (Ctrl+Enter).
6. Ulangi untuk setiap file, **urut dari nomor terkecil ke terbesar**.

Urutan migrasi yang benar (34 file):

```text
20261105033250_001_initial_schema.sql
20261105033317_002_honor_explicit_role.sql
20261105040859_003_exam_tokens_and_lockdown.sql
20261105094718_branding_school_settings_and_logo.sql
20261105095855_question_level_targets_and_teacher_scope.sql
20261105101937_exam_access_tokens_table.sql
20261105101959_exam_level_targets_teacher_scope_and_shuffle.sql
20261105135254_restore_teacher_exam_access_with_admin_full.sql
20261105143542_add_active_exam_status_and_activate.sql
20261105145744_get_class_grade_recap.sql
20261105153229_school_theme_settings.sql
20261105155210_20261105160000_reset_login_and_participant_cards.sql.sql
20261106022737_20261106080000_add_is_active_to_profiles.sql.sql
20261106023933_20261106100000_add_category_to_subjects.sql.sql
20261106031300_20261106120000_add_semester_academic_year_to_exams_and_recap.sql.sql
20261106032322_20261130000_add_question_verification_status.sql.sql
20261106034315_20261106140000_add_exam_approval_workflow.sql.sql
20261106035039_20261106150000_require_exam_approval_before_activate.sql.sql
20261107011850_question_images_column_and_bucket.sql
20261107011905_fetch_student_exam_returns_question_image.sql
20261107014752_add_feedback_to_answers_and_update_grade_essay.sql
20261107022104_20261107020000_add_academic_year_to_homeroom_assignments.sql.sql
20261107023420_20261107030000_add_profiles_delete_policy.sql.sql
20261107045426_20261107040000_harden_exam_submission_integrity.sql.sql
20261107051334_20261107050000_anti_cheat_session_tokens_and_gateway_config.sql.sql
20261108040235_20261108_class_periods_academic_years_semesters.sql
20261108040327_20261108_update_get_class_grade_recap_for_class_periods.sql
20261108065854_fix_rls_infinite_recursion_class_enrollments.sql
20261108092533_backfill_class_enrollment_class_period.sql.sql
20261108115047_enforce_teacher_subject_scope_on_questions.sql.sql
20261108122435_add_avatar_url_and_avatars_bucket.sql.sql
20261108124908_20261108130000_fix_critical_profiles_role_escalation.sql.sql
20261108124923_20261108140000_harden_handle_new_user_and_audit_logs.sql.sql
20261108124952_20261108150000_revoke_anon_profiles_grants.sql.sql
20261108125027_20261108160000_admin_update_user_function.sql.sql
20261108152256_lock_avatar_direct_writes.sql
20261111063939_initial_setup_wizard_lock.sql
```

> **Tip:** Jika ingin menggabungkan semua file menjadi satu untuk dijalankan sekali jalan, gunakan command berikut di terminal (Mac/Linux):

```bash
cat supabase/migrations/*.sql > all_migrations.sql
```

Lalu salin seluruh isi `all_migrations.sql` ke SQL Editor dan klik **Run**.

#### Opsi B: Via Supabase CLI (Untuk yang sudah terbiasa terminal)

```bash
# Install Supabase CLI
brew install supabase/tap/supabase   # macOS
# atau: npm install -g supabase       # via npm

# Login ke akun Supabase Anda
supabase login

# Link ke project baru Anda (dapatkan project reference ID dari Dashboard)
supabase link --project-ref YOUR_PROJECT_REF_ID

# Jalankan semua migrasi yang ada di supabase/migrations/
supabase db push
```

> **Catatan**: `supabase db push` akan menjalankan semua file `.sql` di folder `supabase/migrations/` secara berurutan otomatis.

### 1.3. Verifikasi Migrasi Berhasil

Setelah semua file dijalankan, verifikasi dengan query berikut di **SQL Editor**:

```sql
-- Cek apakah semua tabel utama ada
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

**Tabel yang harus ada (minimal):**
- `profiles`, `subjects`, `classes`, `academic_years`, `semesters`
- `class_periods`, `class_enrollments`, `teacher_assignments`
- `questions`, `exams`, `exam_questions`, `exam_attempts`, `answers`
- `audit_logs`, `school_settings`, `system_setup`

```sql
-- Cek apakah RLS aktif di semua tabel
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Semua tabel harus menunjukkan `rowsecurity = true`.**

```sql
-- Cek apakah trigger handle_new_user sudah terpasang
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';
```

### 1.4. Deploy Edge Functions

Aplikasi ini menggunakan 9 Edge Functions yang harus di-deploy ke Supabase baru Anda. File-nya ada di folder `supabase/functions/`.

**Via Supabase Dashboard:**
1. Buka menu **Edge Functions** (sidebar kiri).
2. Klik **Deploy a new function**.
3. Beri nama sesuai dengan folder function, misalnya `setup-initialize`.
4. Salin seluruh isi `supabase/functions/setup-initialize/index.ts` dan paste.
5. Klik **Deploy**.
6. Ulangi untuk semua 9 functions:
   - `setup-initialize`
   - `admin-create-user`
   - `admin-batch-create-users`
   - `admin-delete-user`
   - `admin-reset-password`
   - `exam-gateway`
   - `change-password`
   - `change-avatar`
   - `enforce-single-session`

**Via Supabase CLI:**
```bash
supabase functions deploy setup-initialize --no-verify-jwt
supabase functions deploy admin-create-user
supabase functions deploy admin-batch-create-users
supabase functions deploy admin-delete-user
supabase functions deploy admin-reset-password
supabase functions deploy exam-gateway
supabase functions deploy change-password
supabase functions deploy change-avatar
supabase functions deploy enforce-single-session
```

> Flag `--no-verify-jwt` hanya untuk `setup-initialize` (harus bisa diakses publik tanpa login, karena fungsinya justru untuk membuat admin pertama).

### 1.5. Konfigurasi Auth (Penting!)

1. Buka menu **Authentication** → **Providers**.
2. Pastikan **Email** provider sudah **Enabled**.
3. Buka **Authentication** → **Sign In / Up**:
   - **Disable** "Confirm email" — siswa tidak perlu verifikasi email untuk bisa login. (Sudah default OFF, pastikan tetap OFF.)
4. Buka **Authentication** → **URL Configuration**:
   - **Site URL**: isi URL Vercel Anda nanti (misalnya `https://ujian-sekolah.vercel.app`).
   - **Redirect URLs**: tambahkan `https://ujian-sekolah.vercel.app/**`.

### 1.6. Konfigurasi Storage Buckets

Beberapa migrasi membuat bucket storage. Pastikan bucket berikut ada di menu **Storage**:

- `question-images` — untuk gambar soal ujian.
- `avatars` — untuk foto profil guru/admin.

Jika bucket belum ada, buat manual:
1. **Storage** → **New bucket**.
2. Nama: `question-images`, **Public bucket**: ON.
3. Nama: `avatars`, **Public bucket**: ON.

---

## 2. Penyesuaian Environment Variables & Koneksi

### 2.1. File yang Perlu Diperbarui

Hanya **SATU file** di codebase yang membaca kredensial Supabase secara langsung:

```
src/lib/supabase.ts
```

File ini sudah membaca dari `import.meta.env` (Vite environment variables), jadi Anda **tidak perlu mengubah kode apapun** — cukup set environment variables-nya saja (lihat Bagian 2.2 dan 3.3).

Semua file lain yang memanggil edge functions juga membaca dari `import.meta.env.VITE_SUPABASE_URL`:
- `src/lib/setup.ts`
- `src/lib/avatar.ts`
- `src/lib/sessionGuard.ts`
- `src/pages/admin.tsx`
- `src/pages/student.tsx`
- `src/components/ProfileSettingsModal.tsx`

Semuanya sudah memakai env vars, jadi tidak ada hardcoding yang perlu diubah.

### 2.2. File `.env.example` (Sudah Dibuat)

File `.env.example` sudah dibuat di root project. Berikut isinya:

```env
# Frontend (Vite — di-expose ke browser, prefixed dengan VITE_)
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...

# Backend / Edge Functions (Deno runtime — TIDAK boleh di-expose ke browser)
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_DB_URL=postgresql://postgres.xxx:password@region.pooler.supabase.com:6543/postgres
```

### 2.3. Cara Mengambil Nilai dari Dashboard Supabase

1. Buka project Supabase baru Anda.
2. **Project Settings** (gear icon kiri bawah) → **API**.
3. Salin nilai berikut:
   - **Project URL** → isi ke `VITE_SUPABASE_URL` dan `SUPABASE_URL`.
   - **anon public** key → isi ke `VITE_SUPABASE_ANON_KEY` dan `SUPABASE_ANON_KEY`.
   - **service_role** key → isi ke `SUPABASE_SERVICE_ROLE_KEY`. **JANGAN pernah expose ini ke browser.**
4. **Project Settings** → **Database** → **Connection string** → **URI**:
   - Salin ke `SUPABASE_DB_URL`. Ganti `[YOUR-PASSWORD]` dengan password database Anda.

### 2.4. Buat File `.env` Lokal untuk Development

```bash
# Di root project, salin dari example
cp .env.example .env

# Edit isi .env dengan nilai dari Supabase baru Anda
# (gunakan editor pilihan Anda)
nano .env
```

> File `.env` sudah ada di `.gitignore` dan **tidak akan ikut ter-push ke GitHub**. Hanya `.env.example` yang akan ter-push.

---

## 3. Deployment ke Vercel

### 3.1. Connect Repository ke Vercel

1. Buka [vercel.com](https://vercel.com) → login dengan akun GitHub Anda.
2. Klik **Add New** → **Project**.
3. Cari repository GitHub Anda di daftar "Import Git Repository".
4. Klik **Import**.
5. Vercel akan otomatis mendeteksi framework sebagai **Vite** (karena `vercel.json` sudah di-set).

### 3.2. Konfigurasi Build (Otomatis dari vercel.json)

File `vercel.json` sudah dibuat di root project dengan konfigurasi:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

> **Tentang `rewrites`**: Aplikasi ini memakai hash-based routing (`#/admin`, `#/guru`, `#/siswa`). Hash routing sebenarnya tidak butuh rewrite, TAPI `rewrites` mencegah 404 jika seseorang mengetik URL path langsung (misal `/index.html` yang hilang) dan memastikan SPA fallback aman.

### 3.3. Environment Variables di Vercel Dashboard

**Sebelum klik Deploy**, scroll ke bawah ke **Environment Variables** section dan tambahkan **4 variabel wajib**:

| Name | Value | Environment |
|------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://xxxxxxxx.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` (anon public key) | Production, Preview, Development |
| `SUPABASE_URL` | `https://xxxxxxxx.supabase.co` (sama) | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` (service role key) | Production, Preview, Development |
| `SUPABASE_ANON_KEY` | `eyJhbGciOi...` (anon public key) | Production, Preview, Development |

> **Catatan Penting tentang Edge Functions**: Edge Functions di Vercel **TIDAK berjalan**. Vercel hanya men-serve frontend (HTML/CSS/JS hasil build). Edge Functions Anda tetap berjalan di **Supabase** (yang sudah Anda deploy di Bagian 1.4). Vercel hanya memanggil URL edge function tersebut. Jadi `SUPABASE_SERVICE_ROLE_KEY` dan `SUPABASE_ANON_KEY` di Vercel sebenarnya **tidak terpakai oleh frontend**, tapi tidak ada salahnya di-set untuk konsistensi.
>
> **Variabel yang BENAR-BENAR wajib di Vercel**: hanya `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`. Yang lain opsional.

5. Klik **Deploy**. Tunggu ± 1-2 menit.
6. Setelah selesai, Vercel akan memberikan URL production (misal `https://ujian-sekolah.vercel.app`).

### 3.4. Update Site URL di Supabase Auth

Setelah deployment Vercel selesai dan Anda punya URL production:

1. Kembali ke **Supabase Dashboard** → **Authentication** → **URL Configuration**.
2. Update **Site URL** ke URL Vercel Anda: `https://ujian-sekolah.vercel.app`.
3. Tambahkan **Redirect URLs**: `https://ujian-sekolah.vercel.app/**`.
4. Klik **Save**.

### 3.5. Custom Domain (Opsional)

1. Vercel Dashboard → project Anda → **Settings** → **Domains**.
2. Tambahkan domain Anda (misal `ujian.sekolahanda.sch.id`).
3. Ikuti instruksi DNS (tambahkan CNAME record di domain registrar Anda).
4. Update **Site URL** di Supabase Auth ke domain custom Anda.

---

## 4. Optimasi Skala Ujian Sekolah (High Traffic)

### 4.1. Supabase Plan — Pro atau Free?

| Fitur | Free Plan | Pro Plan ($25/bln) |
|-------|-----------|---------------------|
| Concurrent connections | Dibatasi, berisiko kena limit | Lebih tinggi, connection pooling |
| Edge Function invocations | 500K/bln | 2M/bln, $2 per 1M additional |
| Database size | 500 MB | 8 GB |
| Realtime concurrent connections | 200 | Tidak ada limit hard |
| Pausing | Project di-pause setelah 1 minggu idle | Tidak di-pause |

**Rekomendasi**: Untuk ujian sekolah dengan ratusan siswa concurrent, **WAJIB Pro Plan**. Free plan berisiko:
- Project di-pause saat tidak ada aktivitas (1 minggu idle).
- Rate limit lebih ketat, bisa menyebabkan error 429 saat ujian serentak.
- Realtime connections terbatas 200.

### 4.2. Connection Pooling (Pv4 / Supavisor)

Supabase versi baru sudah memakai **Supavisor** (connection pooler) secara default. Pastikan:

1. **Project Settings** → **Database** → **Connection Pooling**:
   - Mode: **Transaction** (untuk app serverless / edge functions).
   - Jika ada field **Pool Size**, set ke nilai yang sesuai (default biasanya cukup).

2. Edge Functions sudah memakai service role key dengan `persistSession: false`, yang efisien — tidak membuka koneksi auth yang berlebihan. Tidak ada perubahan kode yang diperlukan.

### 4.3. Optimasi Realtime

Aplikasi ini memakai Supabase realtime untuk fitur pemantauan ujian (live monitoring). Untuk traffic tinggi:

1. **Batasi channel yang di-subscribe**. Pastikan hanya guru/admin yang memantau ujian tertentu yang subscribe ke channel ujian tersebut — tidak global.
2. Supabase client sudah di-config dengan `autoRefreshToken: true` di `src/lib/supabase.ts` — ini sudah benar.
3. Pastikan jumlah concurrent realtime connections tidak melebihi limit plan Anda (Free: 200, Pro: lebih tinggi).

### 4.4. Edge Function Performance

Edge Functions di Supabase berjalan di edge (Deno), yang sudah otomatis scale. Yang perlu diperhatikan:

1. **Cold start**: function pertama kali dipanggil akan lebih lambat (± 200-500ms). Untuk ujian, **lakukan warm-up** sebelum ujian dimulai:
   ```bash
   # Warm up semua edge functions 10 menit sebelum ujian
   curl -X POST https://xxxxxxxx.supabase.co/functions/v1/exam-gateway \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"action":"warmup"}'
   ```

2. **Rate limiting**: Supabase menerapkan rate limit pada Edge Function invocations. Untuk Pro Plan: 2M invocations/bulan. Jika 500 siswa memulai ujian dalam 1 menit, itu ± 500 invocations — masih aman.

### 4.5. Database Indexes (Sudah Ada di Migrasi)

Migrasi yang ada sudah membuat indexes untuk kolom yang sering di-query. Verifikasi dengan:

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

Pastikan ada index pada:
- `exam_attempts(exam_id, student_id)`
- `answers(attempt_id, question_id)`
- `profiles(role)`
- `class_enrollments(student_id, class_id)`

Jika ada yang kurang, tambahkan manual (contoh):

```sql
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_student
ON exam_attempts(exam_id, student_id);
```

### 4.6. Tips Tambahan untuk Ujian Serentak

1. **Staggered start**: Jangan mulai semua kelas bersamaan. Beri jeda 2-3 menit antar kelas untuk mengurangi burst traffic.
2. **Auto-save**: Aplikasi sudah punya auto-save jawaban siswa. Pastikan interval auto-save tidak terlalu agresif (default biasanya 5-10 detik — sudah aman).
3. **Token ujian**: Aplikasi sudah memakai token akses per kelas, yang membantu membatasi siapa yang bisa akses kapan. Pastikan token di-distribusi sebelum ujian, bukan saat ujian dimulai.

---

## 5. Smoke Test Checklist (Sebelum Ujian Resmi)

Lakukan semua tes berikut **minimal 1 hari sebelum ujian**, di URL production Vercel Anda:

### 5.1. Setup Awal
- [ ] Buka URL production → muncul halaman **Setup Wizard** (jika belum ada admin).
- [ ] Isi data sekolah + buat akun Kepala Sekolah.
- [ ] Setelah selesai, redirect ke halaman **Login**.
- [ ] Buka URL `/setup` lagi → **redirect ke /login** (setup sudah terkunci).
- [ ] Coba call `POST /functions/v1/setup-initialize` via cURL/Postman → **403 Forbidden** (kunci bekerja).

### 5.2. Login & Admin
- [ ] Login sebagai Kepala Sekolah → masuk ke **Admin Dashboard**.
- [ ] Buka **Manajemen User** → buat 1 akun Guru → sukses.
- [ ] Buka **Manajemen User** → buat 1 akun Siswa (dengan kelas) → sukses.
- [ ] Login sebagai Guru → masuk ke **Dashboard Guru**.
- [ ] Login sebagai Siswa → masuk ke **Dashboard Siswa**.

### 5.3. Flow Ujian (End-to-End)
- [ ] Sebagai Guru: buat 1 soal PG → publish.
- [ ] Sebagai Guru: buat 1 ujian dengan 1 soal, set jadwal, durasi 5 menit.
- [ ] Sebagai Kepala Sekolah: approve ujian tersebut (jalur persetujuan).
- [ ] Sebagai Guru: aktifkan ujian.
- [ ] Sebagai Siswa: mulai ujian → soal muncul → pilih jawaban → submit.
- [ ] Sebagai Guru: lihat hasil → nilai muncul dengan benar.
- [ ] Sebagai Guru: buka **Pemantauan Ujian** → status siswa real-time muncul.

### 5.4. Performance / Stress Test
- [ ] Buka aplikasi di 5 tab browser sekaligus (simulasi 5 siswa) → semua berjalan mulus.
- [ ] Gunakan tools seperti [k6](https://k6.io) atau [Artillery](https://www.artillery.io) untuk simulasi 100+ concurrent users:
  ```bash
  # Contoh k6 script sederhana
  k6 run --vus 50 --duration 30s script.js
  ```
- [ ] Monitor Supabase Dashboard → **Logs** → pastikan tidak ada error 429 (rate limit) atau 503.

### 5.5. Edge Cases
- [ ] Saat ujian berjalan, putuskan koneksi internet siswa → reconnect → jawaban tersimpan (auto-save bekerja).
- [ ] Siswa coba tab switch melebihi limit → ujian ter-auto-submit.
- [ ] Siswa coba akses ujian tanpa token → ditolak.
- [ ] Guru coba akses halaman admin → di-redirect (RBAC bekerja).

### 5.6. Post-Deployment Sanity Check
- [ ] Buka **Supabase Dashboard** → **Reports** → cek API usage dan database connections.
- [ ] Pastikan tidak ada error log yang berlebihan di **Logs** → **Explorer**.
- [ ] Cek **Storage** → pastikan upload gambar soal berfungsi.

---

## Ringkasan File yang Diubah/Dibuat

| File | Aksi | Keterangan |
|------|------|------------|
| `.env.example` | **Dibuat** | Template env vars untuk referensi |
| `vercel.json` | **Dibuat** | Konfigurasi build + SPA routing untuk Vercel |
| `.gitignore` | **Diperbarui** | Memastikan `.env` tidak ter-push, tapi `.env.example` tetap masuk repo |
| `src/lib/supabase.ts` | Tidak diubah | Sudah membaca dari env vars |
| `supabase/migrations/*` | Tidak diubah | File SQL siap untuk dijalankan di Supabase baru |
| `supabase/functions/*` | Tidak diubah | Edge functions siap untuk di-deploy ke Supabase baru |

---

## Quick Reference — Commands

```bash
# 1. Jalankan migrasi (gabungkan semua file)
cat supabase/migrations/*.sql > all_migrations.sql
# Lalu paste all_migrations.sql ke Supabase SQL Editor → Run

# 2. Install dependencies lokal
npm install

# 3. Setup env lokal
cp .env.example .env
# Edit .env dengan nilai dari Supabase baru Anda

# 4. Test lokal
npm run dev

# 5. Build untuk verifikasi
npm run build

# 6. Deploy edge functions (via CLI, jika menggunakan CLI)
supabase functions deploy setup-initialize --no-verify-jwt
supabase functions deploy admin-create-user
# ... (ulangi untuk semua 9 functions)
```
