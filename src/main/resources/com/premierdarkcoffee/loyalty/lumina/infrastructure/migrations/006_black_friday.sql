CREATE TABLE seasonal_offers (
 plan_id TEXT PRIMARY KEY REFERENCES plans(id),
 base_plan_id TEXT NOT NULL REFERENCES plans(id),
 year INTEGER NOT NULL CHECK(year BETWEEN 2026 AND 2199),
 starts_on TEXT NOT NULL,
 ends_before TEXT NOT NULL,
 regular_minor INTEGER NOT NULL CHECK(regular_minor > 0),
 theme TEXT NOT NULL CHECK(theme IN ('GOLD','VIOLET','ICE')),
 conditions TEXT NOT NULL,
 submission_key TEXT NOT NULL UNIQUE,
 CHECK(starts_on >= printf('%04d-11-01',year) AND starts_on < printf('%04d-12-01',year)),
 CHECK(ends_before = printf('%04d-12-01',year))
);
CREATE TRIGGER seasonal_offers_immutable BEFORE UPDATE ON seasonal_offers BEGIN
 SELECT RAISE(ABORT,'Seasonal offer history is immutable');
END;
CREATE TRIGGER seasonal_offers_keep_history BEFORE DELETE ON seasonal_offers BEGIN
 SELECT RAISE(ABORT,'Seasonal offer history is immutable');
END;
