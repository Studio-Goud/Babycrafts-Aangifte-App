-- BTW Aangifte App - Supabase Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Documents table: stores all uploaded/fetched documents
create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  filename text not null,
  original_filename text not null,
  file_url text,
  file_type text not null, -- 'factuur', 'bon', 'bankafschrift', 'creditnota'
  source text not null, -- 'upload', 'email', 'camera', 'ing_csv'
  source_email text, -- email address it came from
  source_subject text, -- email subject
  status text not null default 'pending', -- 'pending', 'processed', 'error', 'flagged'
  raw_text text, -- extracted text from Claude
  processing_error text,
  kwartaal text, -- e.g. '2024-Q1'
  processed_at timestamptz
);

-- Transactions table: extracted financial data per document
create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  document_id uuid references documents(id) on delete cascade,
  datum date not null,
  leverancier text,
  beschrijving text,
  categorie text, -- 'inkoop', 'verkoop', 'kantoor', 'transport', 'marketing', etc.
  bedrag_excl_btw numeric(10,2) not null,
  btw_percentage numeric(5,2), -- 21, 9, 0
  btw_bedrag numeric(10,2),
  bedrag_incl_btw numeric(10,2),
  type text not null, -- 'inkomend' (kosten) or 'uitgaand' (omzet)
  kvk_nummer text,
  btw_nummer text,
  factuur_nummer text,
  kwartaal text not null, -- e.g. '2024-Q1'
  jaar integer not null,
  maand integer not null,
  verified boolean default false
);

-- Email sync log
create table if not exists email_sync_log (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  synced_at timestamptz default now(),
  emails_found integer default 0,
  documents_created integer default 0,
  status text default 'success', -- 'success', 'error'
  error_message text,
  last_uid bigint -- last processed email UID for incremental sync
);

-- Settings table
create table if not exists settings (
  id uuid primary key default uuid_generate_v4(),
  key text unique not null,
  value text,
  updated_at timestamptz default now()
);

-- Insert default settings
insert into settings (key, value) values
  ('bedrijfsnaam', 'Babycrafts'),
  ('btw_nummer', ''),
  ('kvk_nummer', ''),
  ('email_sync_enabled', 'true'),
  ('email_sync_interval_hours', '6'),
  ('last_email_uid', '0')
on conflict (key) do nothing;

-- Indexes for performance
create index if not exists idx_transactions_kwartaal on transactions(kwartaal);
create index if not exists idx_transactions_datum on transactions(datum);
create index if not exists idx_transactions_type on transactions(type);
create index if not exists idx_documents_status on documents(status);
create index if not exists idx_documents_created_at on documents(created_at);

-- Storage bucket for documents (run separately in Supabase dashboard or via API)
-- insert into storage.buckets (id, name, public) values ('documents', 'documents', false);
