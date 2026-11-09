// Optional local Java renderer for intercepted UI tests; never call a live issuer or customer API.
module.exports = async function renderFixture(route, url) {
    const origin = process.env.LOYALTY_UI_ARTWORK_ORIGIN;
    if (!origin) return false;
    const base = new URL(origin);
    if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.username || base.password)
        throw Error('The artwork fixture must be a local HTTP renderer.');
    if (!/^\/wallet\/art\/v\d+\//.test(url.pathname)) throw Error('Not an artwork URL.');
    const response = await fetch(new URL(url.pathname + url.search, base), {redirect:'error',signal:AbortSignal.timeout(10000)});
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png'))
        throw Error('Missing real artwork: ' + url.pathname + ' (' + response.status + ')');
    await route.fulfill({body:Buffer.from(await response.arrayBuffer()),contentType:'image/png'});
    return true;
};
