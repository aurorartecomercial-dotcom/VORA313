begin;

alter table public.vendas
  add column if not exists itens jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('vora-public', 'vora-public', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists vora_public_images_read on storage.objects;
create policy vora_public_images_read
on storage.objects for select
to anon, authenticated
using (bucket_id = 'vora-public');

drop policy if exists vora_public_images_insert on storage.objects;
create policy vora_public_images_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'vora-public'
  and (
    public.is_admin()
    or (name like 'vendedores/' || auth.uid()::text || '/%')
  )
);

drop policy if exists vora_public_images_update on storage.objects;
create policy vora_public_images_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'vora-public'
  and (public.is_admin() or name like 'vendedores/' || auth.uid()::text || '/%')
)
with check (
  bucket_id = 'vora-public'
  and (public.is_admin() or name like 'vendedores/' || auth.uid()::text || '/%')
);

commit;
