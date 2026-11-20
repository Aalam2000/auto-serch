-- Petrol rules are for W124 only: every petrol 190 is KE-Jetronic.
UPDATE settings SET value = json_set(value, '$.engines', json('[
  { "label": "Дизель 2.5 / 3.0 (W124 и 190)", "fuel": "Дизель", "liters": [2.5, 3.0] },
  { "label": "E 220 (M111), только W124", "fuel": "Бензин", "liters": [2.2],
    "namePattern": "^Mercedes (?!190)(E \\d{3}|\\d{3} ?(E|TE|CE))$" },
  { "label": "E 200 / E 280 / E 320 с 1993, только W124", "fuel": "Бензин", "liters": [2.0, 2.8, 3.2], "yearFrom": 1993,
    "namePattern": "^Mercedes (?!190)(E \\d{3}|\\d{3} ?(E|TE|CE))$" }
]')) WHERE key = 'filter';

-- The petrol 190 that slipped through.
DELETE FROM reviews WHERE ad_id IN (SELECT id FROM ads WHERE name LIKE 'Mercedes 190%' AND fuel = 'Бензин');
UPDATE ads SET status = 'filtered_out', status_reason = 'мотор не подходит: бензиновый 190 (KE-Jetronic)'
 WHERE name LIKE 'Mercedes 190%' AND fuel = 'Бензин';
