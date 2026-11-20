-- ru.turbo.az writes Tovuz as "Тауз"
INSERT OR REPLACE INTO cities (name, distance_km) VALUES ('Тауз', 450);
UPDATE ads SET distance_km = 450 WHERE city = 'Тауз';
