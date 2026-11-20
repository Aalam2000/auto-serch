ALTER TABLE ads ADD COLUMN photos TEXT; -- JSON array of photo URLs

INSERT INTO settings (key, value) VALUES ('rank', '{
  "pricePenaltyPer": 100,
  "distancePenaltyPer": 20
}');
