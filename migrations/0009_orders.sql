-- Orders from the landing page form.
CREATE TABLE orders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  contact    TEXT NOT NULL,
  message    TEXT NOT NULL,
  lang       TEXT,
  country    TEXT,
  created_at TEXT NOT NULL
);
