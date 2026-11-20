-- Hard distance limit 450 km. Far ads (>150 km) will need a high AI score later.
UPDATE settings SET value = json_set(value, '$.maxDistanceKm', 450) WHERE key = 'filter';
-- Re-open ads that were cut only by distance and are now within the limit.
UPDATE ads SET status = 'new', status_reason = NULL
 WHERE status = 'filtered_out' AND status_reason LIKE 'далеко:%' AND distance_km <= 450;
