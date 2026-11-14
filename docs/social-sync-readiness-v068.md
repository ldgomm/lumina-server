# Social metric synchronization readiness

Reviewed November 14, 2026. This release improves manual measurement quality and comparison. It does not connect external accounts, create provider apps, request tokens, scrape profiles or claim automatic synchronization.

| Platform | Supported direction to investigate | Prerequisites and limits |
|---|---|---|
| Instagram | Professional-account media and insights through the selected Instagram OAuth product. | The business must authorize its professional account. Instagram Login and Facebook Login have different scopes/account requirements; verify the chosen app's reviewed scopes before implementation. Missing/private metrics must remain unknown. |
| Facebook | Page Insights plus the appropriate video/Reels endpoints. | Page access token, ANALYZE task, `read_insights` and `pages_read_engagement` as applicable. The Page Insights reference does not include Reels metrics; do not treat it as a universal video endpoint. Some metrics are delayed or deprecated. |
| TikTok | Display API video query for authorized videos: views, likes, comments and shares. | User authorization with `video.list`, application review and provider limits. Query batches are limited to 20 video IDs. Research API is not a substitute for this commercial integration. |
| YouTube | Data API video statistics and authorized channel Analytics reports. | A Google developer project and channel-owner OAuth for Analytics; request read-only analytics scope. Respect quota, latency and availability rather than representing all metrics as immediate. |
| Google Maps | Business Profile Performance API for location metrics. | Business Profile API access approval, authorized location management and `business.manage`. Map business actions are distinct from social video views. |

## Implementation acceptance criteria

Connect a provider only after the authorized owner chooses the exact account/location. Keep each business's encrypted credentials separate. Refresh, expiry, revocation and disconnect must be explicit states. Background jobs need bounded retries, rate-limit handling, idempotent snapshots, collection time, source/API version and last successful sync. Disconnecting must stop jobs without deleting historical measurements.

Map each external publication to the existing shared content piece. Never create four independent productions for the same video or multiply contracted units by platform count. Preserve manual history; identify source conflicts rather than overwriting values silently. Null/unavailable is different from zero. Compare matched publications and equivalent metrics, and do not sum cross-platform reach as unique people.

Automatic synchronization remains pending until provider applications, scopes and real account authorization are available and verified. The current portal does not ask for social-network passwords.

## Primary references

- [Instagram platform changelog](https://developers.facebook.com/docs/instagram/platform/instagram-api/changelog/)
- [Instagram media reference](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/v21.0/?locale=es_LA)
- [Facebook Insights reference](https://developers.facebook.com/docs/graph-api/reference/insights/)
- [TikTok video query](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query?enter_method=left_navigation)
- [TikTok video object](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object?enter_method=left_navigation)
- [YouTube Analytics authorization](https://developers.google.com/youtube/reporting/guides/authorization)
- [YouTube Analytics data model](https://developers.google.com/youtube/analytics/data_model)
- [Business Profile basic setup](https://developers.google.com/my-business/content/basic-setup)
- [Business Profile Performance API](https://developers.google.com/my-business/reference/performance/rpc/google.mybusiness.performance.v1)
