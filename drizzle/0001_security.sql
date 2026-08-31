-- Security layer. Drizzle cannot express any of this, so it is hand-written.
-- Run this AFTER 0000_init.sql.

-- 1. Tie rows to real auth users. Deleting an account removes its data.
ALTER TABLE "domains"
  ADD CONSTRAINT "domains_user_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "entries"
  ADD CONSTRAINT "entries_user_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Row Level Security.
--
-- The app server talks to Postgres over the pooler connection and enforces
-- user_id in every query itself. RLS is the second layer: the anon key is
-- public by design (it ships to the browser), so without these policies
-- anyone holding it could read the whole table through the REST API.
--
-- Two independent things must both fail before data leaks.

ALTER TABLE "domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own domains" ON "domains"
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own entries" ON "entries"
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No policy for the `anon` role at all, so signed-out requests see nothing.

-- 3. Keep updated_at honest without trusting the application to set it.
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER entries_touch_updated_at
  BEFORE UPDATE ON "entries"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 4. Starter domains for every new account, so the first screen is not empty.
CREATE OR REPLACE FUNCTION seed_domains_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.domains (user_id, name, kind) VALUES
    (NEW.id, 'Food & tiffin',     'expense'),
    (NEW.id, 'Transport',         'expense'),
    (NEW.id, 'Mobile & internet', 'expense'),
    (NEW.id, 'Books & printing',  'expense'),
    (NEW.id, 'Entertainment',     'expense'),
    (NEW.id, 'Monthly allowance', 'income'),
    (NEW.id, 'Tutoring',          'income'),
    (NEW.id, 'Emergency fund',    'savings');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION seed_domains_for_new_user();
