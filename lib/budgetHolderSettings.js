function resolveBudgetHolderSettings(lookup = {}, environment = process.env) {
  function value(name, fallback) {
    return environment[name] === undefined ? fallback : environment[name];
  }
  return {
    ...lookup,
    url: value('BUDGET_HOLDER_URL', lookup.url),
    username: value('BUDGET_HOLDER_USERNAME', lookup.username),
    password: value('BUDGET_HOLDER_PASSWORD', lookup.password),
    credentialsFile: value(
      'BUDGET_HOLDER_CREDENTIALS_FILE',
      lookup.credentialsFile
    ),
    identityFile: value('BUDGET_HOLDER_IDENTITY_FILE', lookup.identityFile),
    fixture: value('BUDGET_HOLDER_FIXTURE', ''),
    proxyMode: value('BUDGET_HOLDER_PROXY_MODE', lookup.proxyMode || 'auto'),
    headers: {
      ...(lookup.headers || {}),
      authorization: value(
        'BUDGET_HOLDER_AUTHORIZATION',
        lookup.headers ? lookup.headers.authorization : undefined
      ),
      cookie: value(
        'BUDGET_HOLDER_COOKIE',
        lookup.headers ? lookup.headers.cookie : undefined
      ),
    },
  };
}

module.exports = { resolveBudgetHolderSettings };
