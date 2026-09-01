-- Quitar a alguien del equipo exige poder borrar su membresía. RLS ya limita
-- el borrado a los negocios de los que el usuario es miembro.
grant delete on business_members to authenticated;

create policy "members can remove memberships"
  on business_members for delete
  using (is_business_member(business_id));
