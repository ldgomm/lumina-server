-- Existing programs retain their visibility. Seasonal eligibility is evaluated
-- on every read, including after a restart; it does not depend on a timer job.
CREATE FUNCTION black_friday_available(config JSONB, at_time TIMESTAMPTZ) RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
 SELECT CASE WHEN config->>'blackFridayYear' IS NULL THEN true ELSE
   at_time >= make_timestamptz((config->>'blackFridayYear')::int,11,1,0,0,0,'America/Guayaquil')
   AND at_time < make_timestamptz((config->>'blackFridayYear')::int,12,1,0,0,0,'America/Guayaquil')
   AND at_time >= (config->'window'->>'startsAt')::timestamptz
   AND at_time < (config->'window'->>'endsAt')::timestamptz
 END
$$;
CREATE OR REPLACE VIEW customer_programs AS
 SELECT p.tenant_id,p.id,p.kind,p.current_version,v.config
 FROM programs p JOIN program_versions v ON v.tenant_id=p.tenant_id AND v.program_id=p.id AND v.version=p.current_version
 WHERE p.deleted_at IS NULL AND coalesce((v.config->>'active')::boolean,true)
 AND coalesce(black_friday_available(v.config,statement_timestamp()),false);
