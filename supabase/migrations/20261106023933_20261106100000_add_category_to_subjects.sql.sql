-- Add category column to subjects for grouping (Wajib / Pilihan / Muatan Lokal)
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'wajib';
