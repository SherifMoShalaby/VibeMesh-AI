-- Run this in your Supabase dashboard → SQL Editor

CREATE TABLE public.projects (
  id             TEXT     PRIMARY KEY,
  user_id        UUID     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT     NOT NULL,
  code           TEXT     NOT NULL DEFAULT '',
  param_values   JSONB    NOT NULL DEFAULT '{}',
  chat           JSONB    NOT NULL DEFAULT '[]',
  chat_future    JSONB,
  created_at     BIGINT   NOT NULL,
  updated_at     BIGINT   NOT NULL,
  schema_version INTEGER  NOT NULL DEFAULT 1,
  raw            JSONB    -- full Project blob for forward-compatibility
);

CREATE INDEX projects_user_updated ON public.projects (user_id, updated_at DESC);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user isolation"
  ON public.projects
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
