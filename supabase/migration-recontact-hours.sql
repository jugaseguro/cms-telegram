-- Add condition_unit column to support hours/days in recontact rules
ALTER TABLE public.recontact_rules
  ADD COLUMN condition_unit text NOT NULL DEFAULT 'days'
  CHECK (condition_unit IN ('hours', 'days'));
