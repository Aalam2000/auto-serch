-- When to send a reviewed ad to Telegram.
INSERT INTO settings (key, value) VALUES ('notify', '{
  "tiers": [
    { "maxKm": 150, "minScore": 50 },
    { "maxKm": 300, "minScore": 70 },
    { "maxKm": 450, "minScore": 85 }
  ],
  "unknownDistanceKm": 300,
  "perRun": 5
}');
