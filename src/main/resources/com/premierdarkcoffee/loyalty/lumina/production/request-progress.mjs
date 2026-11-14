// Read-only summaries shared by the home, request inbox and content workspace.
// Each correlated query includes both the business and request identifiers.
export const requestProgressSql = `
  (SELECT count(*) FROM pieces p WHERE p.company_id=r.company_id AND p.request_id=r.id AND p.status='DELIVERED') AS delivered,
  (SELECT count(*) FROM pieces p WHERE p.company_id=r.company_id AND p.request_id=r.id AND p.status='REVIEW') AS in_review,
  (SELECT p.id FROM pieces p WHERE p.company_id=r.company_id AND p.request_id=r.id AND p.status='REVIEW' ORDER BY p.created_at,p.id LIMIT 1) AS review_piece_id,
  (SELECT p.id FROM pieces p WHERE p.company_id=r.company_id AND p.request_id=r.id AND p.status='APPROVED' ORDER BY p.created_at,p.id LIMIT 1) AS approved_piece_id,
  (SELECT group_concat(platform) FROM request_platforms rp WHERE rp.company_id=r.company_id AND rp.request_id=r.id) AS targets`;

export const requestStages = Object.freeze({
  all:'1=1',open:"r.status NOT IN ('DELIVERED','CANCELLED')",closed:"r.status IN ('DELIVERED','CANCELLED')",
});
