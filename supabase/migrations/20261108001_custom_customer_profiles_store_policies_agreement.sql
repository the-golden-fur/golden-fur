-- Store policies agreement, recorded once per customer account instead of
-- re-asked on every booking. The booking wizard compares
-- store_policies_agreed_version against the client's STORE_POLICIES_VERSION
-- constant (StorePoliciesModal.tsx) - bumping that constant when the policy
-- text changes makes every customer agree once more. Both nullable: null =
-- never agreed. Written only via the dedicated
-- POST /customers/:id/store-policies-agreement endpoint (self only), never
-- through the general profile PATCH - same separation profile_photo_url has.

alter table public.customer_profiles
  add column store_policies_agreed_version integer,
  add column store_policies_agreed_at timestamptz;
