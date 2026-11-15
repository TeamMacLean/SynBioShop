const axios = require('axios');
const https = require('https');
const { getProxyForUrl } = require('proxy-from-env');
const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const { parseBudgetHolders } = require('./budgetHolderRules');
const { loadCredentials } = require('./budgetHolderCredentials');

function buildRequest(lookup) {
  if (!lookup.url || !/^https?:\/\//i.test(lookup.url)) {
    throw new Error('The intranet budget-holder URL is not configured.');
  }
  const headers = { Accept: 'text/html' };
  if (lookup.username || lookup.password) {
    if (!lookup.username || !lookup.password || lookup.username.includes(':')) {
      throw new Error(
        'Intranet request requires both a valid username and password.'
      );
    }
    headers.Authorization = `Basic ${Buffer.from(`${lookup.username}:${lookup.password}`).toString('base64')}`;
    // Explicit Basic authentication never depends on an old browser session.
  } else {
    if (lookup.headers && lookup.headers.authorization)
      headers.Authorization = lookup.headers.authorization;
    if (lookup.headers && lookup.headers.cookie)
      headers.Cookie = lookup.headers.cookie;
  }
  const url = new URL(lookup.url);
  if (url.username || url.password)
    throw new Error(
      'Intranet request credentials must not be embedded in the URL.'
    );
  if ((headers.Authorization || headers.Cookie) && url.protocol !== 'https:') {
    throw new Error(
      'Intranet request credentials may only be sent over HTTPS.'
    );
  }
  const options = {
    headers,
    timeout: 20000,
    maxContentLength: 2 * 1024 * 1024,
    maxRedirects: 0,
    responseType: 'text',
    ...(lookup.proxyMode === 'direct' ? { proxy: false } : {}),
  };
  if (url.protocol === 'https:') {
    try {
      const proxy =
        lookup.proxyMode === 'direct' ? '' : getProxyForUrl(lookup.url);
      if (proxy && !['http:', 'https:'].includes(new URL(proxy).protocol)) {
        throw new Error('Unsupported proxy protocol');
      }
      // Axios's proxy rewriting sends an absolute-form GET, not CONNECT.
      // Let Node tunnel first, then send credentials inside verified TLS.
      options.proxy = false;
      options.httpsAgent = new https.Agent({
        // Bound the CONNECT phase too; Axios sets its socket timeout later.
        timeout: options.timeout,
        proxyEnv: proxy ? { https_proxy: proxy } : {},
      });
    } catch (error) {
      // A malformed proxy URL may contain credentials; never echo it.
      throw new Error(
        'Intranet request proxy configuration is invalid. Use an HTTP(S) proxy URL.'
      );
    }
  }
  return options;
}

function requestFailure(error) {
  const status = error.response ? error.response.status : null;
  const reasons = {
    ENOTFOUND: 'DNS lookup failed. Check the VPN and DNS configuration.',
    EAI_AGAIN:
      'DNS lookup temporarily failed. Check the VPN and DNS configuration.',
    ERR_PROXY_TUNNEL:
      'The HTTPS proxy tunnel failed. Check the proxy and network access.',
    ECONNREFUSED:
      'The connection was refused. Check the destination and any proxy.',
    ECONNRESET: 'The connection was reset. Check network/proxy reliability.',
    ETIMEDOUT: 'The request timed out. Check VPN, routing and firewall access.',
    ECONNABORTED:
      'The request timed out after 20 seconds. Check network access.',
    EPERM: 'The operating system or sandbox blocked the connection.',
    EACCES: 'The operating system or sandbox blocked the connection.',
    CERT_HAS_EXPIRED: 'The TLS certificate has expired.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE:
      'The TLS certificate chain is not trusted. Configure the appropriate CA.',
    SELF_SIGNED_CERT_IN_CHAIN:
      'The TLS certificate chain is not trusted. Configure the appropriate CA.',
    DEPTH_ZERO_SELF_SIGNED_CERT:
      'The TLS certificate is not trusted. Configure the appropriate CA.',
    ERR_TLS_CERT_ALTNAME_INVALID:
      'The TLS certificate does not match the intranet hostname.',
  };
  let message;
  if (status === 401)
    message =
      'Intranet request returned HTTP 401. The configured authentication was not accepted.';
  else if (status === 403)
    message =
      'Intranet request returned HTTP 403. Check account permissions and network/proxy access.';
  else if (status)
    message = `Intranet request returned HTTP ${status}. Check the URL and authentication.`;
  else
    message = `Intranet request failed: ${reasons[error.code] || 'Check connectivity, TLS and proxy settings.'}`;
  const failure = new Error(message);
  failure.code = status
    ? `HTTP_${status}`
    : reasons[error.code]
      ? error.code
      : 'NETWORK_ERROR';
  return failure;
}

async function fetchHolders(lookup = config.lookupBudget || {}) {
  if (lookup.fixture) {
    if (
      config.isProduction ||
      (!config.devMode && !config.isTest) ||
      !['before', 'after'].includes(lookup.fixture)
    ) {
      throw new Error(
        'Intranet request fixture mode is only allowed in development/tests with before or after.'
      );
    }
    const html = await fs.readFile(
      path.join(
        __dirname,
        '../test/fixtures/budget-holders',
        `${lookup.fixture}.html`
      ),
      'utf8'
    );
    return parseBudgetHolders(html);
  }
  const credentials = await loadCredentials(lookup);
  const options = buildRequest(credentials);
  let response;
  try {
    response = await axios.get(lookup.url, options);
  } catch (error) {
    // Axios errors contain request headers. Never persist or log credentials.
    throw requestFailure(error);
  } finally {
    if (options.httpsAgent) options.httpsAgent.destroy();
  }
  return parseBudgetHolders(response.data);
}

module.exports = { fetchHolders, buildRequest, requestFailure };
