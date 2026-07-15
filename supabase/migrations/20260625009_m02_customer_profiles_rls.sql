ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view their own profile."
  ON public.customer_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Customers can update their own profile."
  ON public.customer_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Note: INSERT is typically handled by the service role during signup in this application architecture
-- as the backend route uses the Supabase service role key to insert the profile after creating the auth user.
