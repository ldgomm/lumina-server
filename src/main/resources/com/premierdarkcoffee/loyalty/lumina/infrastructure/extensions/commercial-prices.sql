-- Freeze the other-services share at the price agreed for each line.
ALTER TABLE package_order_lines ADD COLUMN quoted_other_minor INTEGER CHECK(quoted_other_minor>=0);
UPDATE package_order_lines SET quoted_other_minor=(
    SELECT b.other_minor FROM plan_billing b WHERE b.plan_id=package_order_lines.plan_id
);

-- Only open selections change. A browser displaying a prior amount must review the new revision.
CREATE TEMP TABLE repriced_orders AS
SELECT DISTINCT o.id FROM package_orders o JOIN package_order_lines l ON l.order_id=o.id
WHERE o.status IN ('REQUESTED','QUOTED') AND o.trial_archive=0
  AND (l.catalog_minor%100=99 OR l.unit_minor%100=99 OR l.quoted_other_minor%100=99);
UPDATE package_orders SET revision=revision+1 WHERE id IN (SELECT id FROM repriced_orders);
UPDATE package_order_lines SET
    catalog_minor=catalog_minor+CASE WHEN catalog_minor%100=99 THEN 1 ELSE 0 END,
    unit_minor=unit_minor+CASE WHEN unit_minor%100=99 THEN 1 ELSE 0 END,
    quoted_other_minor=quoted_other_minor+CASE WHEN quoted_other_minor%100=99 THEN 1 ELSE 0 END
WHERE order_id IN (SELECT id FROM repriced_orders);
DROP TABLE repriced_orders;

-- Reissue open quotes under a new identity. Accepting an older page cannot accept a higher price.
CREATE TEMP TABLE repriced_quotes AS SELECT * FROM quotes WHERE status='OFFERED' AND amount_minor%100=99;
UPDATE quotes SET status='SUPERSEDED' WHERE id IN (SELECT id FROM repriced_quotes);
INSERT INTO quotes(id,company_id,request_id,revision,amount_minor,terms,status,created_at)
SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||
       '-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
       company_id,request_id,revision+1,amount_minor+1,terms,'OFFERED',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM repriced_quotes;
UPDATE requests SET revision=revision+1 WHERE id IN (SELECT request_id FROM repriced_quotes);
DROP TABLE repriced_quotes;
