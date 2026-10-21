-- Custom change (Trends page): get_trends() - what's popular over a date
-- range, for one branch or (p_branch_id null) every branch together. Read by
-- GET /reports/trends (trends.service.ts) for Superadmin/Admin/Supervisor.
--
-- "Booked" = the booking was made (bookings.created_at) inside the range,
-- same basis as goal_period_stats() (20261011259); Cancelled bookings are
-- left out. Range days are Manila days: p_date_from 00:00 up to (not
-- including) the day after p_date_to, Asia/Manila.
--
-- Pets and customers have no branch, so for a single branch "registered
-- pets" and "deleted pets" mean pets that have ever had a booking there.
--
-- Keys:
--   bookings_total           int
--   bookings_by_category     { <service_category>: n }
--   bookings_by_pet_type     { <pet_type>: n }
--   registered_pets_by_type  { <pet_type>: n }   active, not archived
--   new_pets_by_type         { <pet_type>: n }   created in the range
--   packages_booked          [{ name, count }]   listed packages incl. 0
--   top_grooming_services    [{ name, count }]   top 10
--   staff_bookings           [{ staff_id, display_name, role, bookings,
--                               completed }]     Groomers/Veterinarians,
--                            plus an 'Unassigned' row (staff_id null) per
--                            role for Grooming/Veterinary bookings with no
--                            assigned_staff_id
--   deleted_pet_reasons      { <archive_reason>: n }  (20261021275)
--   deleted_pet_other_notes  [{ note, archived_at }]  latest 10 'other'
--
-- Only the server's service-role client calls this, so execute is revoked
-- from everyone else (it's security definer).

create or replace function public.get_trends(
  p_date_from date,
  p_date_to date,
  p_branch_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      p_date_from::timestamp at time zone 'Asia/Manila' as range_start,
      (p_date_to + 1)::timestamp at time zone 'Asia/Manila' as range_end
  ),
  period_bookings as (
    select b.*
    from public.bookings b, bounds
    where b.created_at >= bounds.range_start
      and b.created_at < bounds.range_end
      and b.status <> 'Cancelled'
      and (p_branch_id is null or b.branch_id = p_branch_id)
  ),
  branch_pets as (
    select p.*
    from public.pets p
    where p_branch_id is null
      or exists (
        select 1
        from public.bookings b
        where b.pet_id = p.id
          and b.branch_id = p_branch_id
      )
  ),
  staff_rows as (
    select
      s.id as staff_id,
      s.display_name,
      s.role::text as role,
      count(pb.id)::int as bookings,
      (count(pb.id) filter (where pb.status = 'Completed'))::int as completed
    from public.staff_profiles s
    left join period_bookings pb on pb.assigned_staff_id = s.id
    where s.role in ('Groomer', 'Veterinarian')
      and (
        (
          s.is_active
          and s.archived_at is null
          and (p_branch_id is null or s.branch_id = p_branch_id)
        )
        -- Someone from another branch (or since deactivated) who still
        -- had bookings here in the range.
        or s.id in (select assigned_staff_id from period_bookings)
      )
    group by s.id, s.display_name, s.role
  ),
  unassigned_rows as (
    select
      null::uuid as staff_id,
      'Unassigned' as display_name,
      case pb.service_category
        when 'Grooming' then 'Groomer'
        else 'Veterinarian'
      end as role,
      count(*)::int as bookings,
      (count(*) filter (where pb.status = 'Completed'))::int as completed
    from period_bookings pb
    where pb.assigned_staff_id is null
      and pb.service_category in ('Grooming', 'Veterinary')
    group by 3
  )
  select jsonb_build_object(
    'bookings_total', (select count(*)::int from period_bookings),
    'bookings_by_category', coalesce((
      select jsonb_object_agg(category_row.service_category, category_row.booking_count)
      from (
        select pb.service_category, count(*)::int as booking_count
        from period_bookings pb
        group by pb.service_category
      ) category_row
    ), '{}'::jsonb),
    'bookings_by_pet_type', coalesce((
      select jsonb_object_agg(type_row.pet_type, type_row.booking_count)
      from (
        select p.pet_type, count(*)::int as booking_count
        from period_bookings pb
        join public.pets p on p.id = pb.pet_id
        group by p.pet_type
      ) type_row
    ), '{}'::jsonb),
    'registered_pets_by_type', coalesce((
      select jsonb_object_agg(type_row.pet_type, type_row.pet_count)
      from (
        select bp.pet_type, count(*)::int as pet_count
        from branch_pets bp
        where bp.is_active
          and bp.archived_at is null
        group by bp.pet_type
      ) type_row
    ), '{}'::jsonb),
    'new_pets_by_type', coalesce((
      select jsonb_object_agg(type_row.pet_type, type_row.pet_count)
      from (
        select bp.pet_type, count(*)::int as pet_count
        from branch_pets bp, bounds
        where bp.created_at >= bounds.range_start
          and bp.created_at < bounds.range_end
        group by bp.pet_type
      ) type_row
    ), '{}'::jsonb),
    'packages_booked', coalesce((
      select jsonb_agg(
        jsonb_build_object('name', package_row.name, 'count', package_row.booking_count)
        order by package_row.booking_count desc, package_row.name
      )
      from (
        -- `name` unqualified: the merged USING column, so a package that
        -- was booked but is no longer listed still keeps its name.
        select name, coalesce(booked.booking_count, 0) as booking_count
        from (
          select distinct btrim(p.name) as name
          from public.packages p
          where p.is_active
            and p.archived_at is null
            and (
              p_branch_id is null
              or exists (
                select 1
                from public.package_branch_availability pba
                where pba.package_id = p.id
                  and pba.branch_id = p_branch_id
                  and pba.is_available
              )
            )
        ) listed
        full join (
          select btrim(p.name) as name, count(*)::int as booking_count
          from public.booking_items bi
          join period_bookings pb on pb.id = bi.booking_id
          join public.packages p on p.id = bi.package_id
          group by btrim(p.name)
        ) booked using (name)
      ) package_row
    ), '[]'::jsonb),
    'top_grooming_services', coalesce((
      select jsonb_agg(
        jsonb_build_object('name', service_row.name, 'count', service_row.booking_count)
        order by service_row.booking_count desc, service_row.name
      )
      from (
        select btrim(s.name) as name, count(*)::int as booking_count
        from public.booking_items bi
        join period_bookings pb on pb.id = bi.booking_id
        join public.services s on s.id = bi.service_id
        where s.category = 'Grooming'
        group by btrim(s.name)
        order by booking_count desc, name
        limit 10
      ) service_row
    ), '[]'::jsonb),
    'staff_bookings', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'staff_id', staff_row.staff_id,
          'display_name', staff_row.display_name,
          'role', staff_row.role,
          'bookings', staff_row.bookings,
          'completed', staff_row.completed
        )
        order by
          staff_row.role,
          staff_row.staff_id is null,
          staff_row.bookings desc,
          staff_row.display_name
      )
      from (
        select * from staff_rows
        union all
        select * from unassigned_rows
      ) staff_row
    ), '[]'::jsonb),
    'deleted_pet_reasons', coalesce((
      select jsonb_object_agg(reason_row.archive_reason, reason_row.pet_count)
      from (
        select bp.archive_reason, count(*)::int as pet_count
        from branch_pets bp, bounds
        where bp.archived_at >= bounds.range_start
          and bp.archived_at < bounds.range_end
          and bp.archive_reason is not null
        group by bp.archive_reason
      ) reason_row
    ), '{}'::jsonb),
    'deleted_pet_other_notes', coalesce((
      select jsonb_agg(
        jsonb_build_object('note', note_row.archive_reason_other, 'archived_at', note_row.archived_at)
        order by note_row.archived_at desc
      )
      from (
        select bp.archive_reason_other, bp.archived_at
        from branch_pets bp, bounds
        where bp.archived_at >= bounds.range_start
          and bp.archived_at < bounds.range_end
          and bp.archive_reason = 'other'
          and bp.archive_reason_other is not null
        order by bp.archived_at desc
        limit 10
      ) note_row
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.get_trends(date, date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_trends(date, date, uuid) to service_role;
