const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rules = require('../../lib/budgetHolderRules');

function fixture() {
  const axios = { get: sinon.stub() };
  const config = {
    devMode: true,
    isTest: false,
    isProduction: false,
    lookupBudget: {
      url: 'https://intranet.example/costcentres/',
      headers: {
        authorization: 'test-auth',
        cookie: 'test-cookie',
        cookie_note: 'never send this',
      },
    },
  };
  const filename = path.resolve(__dirname, '../../lib/budgetHolderSource.js');
  const dependencies = {
    axios,
    '../config': config,
    './budgetHolderRules': rules,
    './budgetHolderCredentials': require('../../lib/budgetHolderCredentials'),
  };
  const sandbox = {
    module: { exports: {} },
    URL,
    Buffer,
    __dirname: path.dirname(filename),
    require: function (name) {
      return dependencies[name] || require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return { source: sandbox.module.exports, axios, config };
}

describe('Budget-holder intranet request', function () {
  it('uses fresh Basic credentials without the stale browser cookie', async function () {
    const { source, axios, config } = fixture();
    config.lookupBudget.username = 'service-user';
    config.lookupBudget.password = 'fresh-password';
    axios.get.resolves({
      data: '<select name="BH"><option value="testuser">Test User (TSL)</option></select>',
    });
    await source.fetchHolders();
    const options = axios.get.firstCall.args[1];
    expect(options.headers.Authorization).to.equal(
      `Basic ${Buffer.from('service-user:fresh-password').toString('base64')}`
    );
    expect(options.headers).to.not.have.property('Cookie');
  });

  it('rejects incomplete credentials and prevents sending credentials over plain HTTP', function () {
    const { source } = fixture();
    expect(function () {
      source.buildRequest({
        url: 'https://intranet.example',
        username: 'deeks',
      });
    }).to.throw('both');
    expect(function () {
      source.buildRequest({
        url: 'http://intranet.example',
        username: 'deeks',
        password: 'secret',
      });
    }).to.throw('HTTPS');
    expect(function () {
      source.buildRequest({ url: 'https://deeks:secret@intranet.example' });
    }).to.throw('embedded');
  });

  it('can explicitly bypass the environment proxy', function () {
    const { source, config } = fixture();
    expect(
      source.buildRequest({ ...config.lookupBudget, proxyMode: 'direct' }).proxy
    ).to.equal(false);
    expect(source.buildRequest(config.lookupBudget)).to.not.have.property(
      'proxy'
    );
  });

  it('distinguishes DNS, TLS, timeout and sandbox failures without exposing request contents', function () {
    const { source } = fixture();
    for (const [code, message] of [
      ['ENOTFOUND', 'DNS'],
      ['CERT_HAS_EXPIRED', 'TLS'],
      ['ETIMEDOUT', 'timed out'],
      ['EPERM', 'sandbox'],
    ]) {
      const error = source.requestFailure({
        code,
        message: 'secret request data',
        config: { password: 'secret' },
      });
      expect(error.code).to.equal(code);
      expect(error.message).to.include(message);
      expect(error.message).to.not.include('secret');
    }
  });

  it('loads both fixed snapshots through the real parser without making a request', async function () {
    const { source, axios, config } = fixture();
    config.lookupBudget.credentialsFile = '/missing/credentials.age';
    config.lookupBudget.fixture = 'before';
    const before = await source.fetchHolders();
    config.lookupBudget.fixture = 'after';
    const after = await source.fetchHolders();
    expect(before).to.have.lengthOf(8);
    expect(after).to.have.lengthOf(10);
    expect(
      before.some(function (holder) {
        return holder.username === 'wrong_list';
      })
    ).to.equal(false);
    expect(axios.get.called).to.equal(false);
  });

  it('refuses fixtures outside development/tests or with arbitrary file paths', async function () {
    const { source, config } = fixture();
    for (const settings of [
      { isProduction: true, devMode: true, fixture: 'before' },
      { isProduction: false, devMode: false, fixture: 'before' },
      { isProduction: false, devMode: true, fixture: '../../config.json' },
    ]) {
      Object.assign(config, {
        isProduction: settings.isProduction,
        devMode: settings.devMode,
      });
      config.lookupBudget.fixture = settings.fixture;
      let error;
      try {
        await source.fetchHolders();
      } catch (caught) {
        error = caught;
      }
      expect(error.message).to.include('fixture mode');
    }
  });

  it('uses configured credentials only with the configured source, and bounds the request', async function () {
    const { source, axios, config } = fixture();
    axios.get.resolves({
      data: '<select name="BH"><option value="smithj">John Smith (JIC)</option></select>',
    });
    expect((await source.fetchHolders())[0].institute).to.equal('JIC');
    const [url, options] = axios.get.firstCall.args;
    expect(url).to.equal(config.lookupBudget.url);
    expect(options.headers).to.deep.equal({
      Accept: 'text/html',
      Authorization: 'test-auth',
      Cookie: 'test-cookie',
    });
    expect(options).to.include({
      timeout: 20000,
      maxRedirects: 0,
      maxContentLength: 2097152,
    });
  });

  it('sanitises failures without persisting credential-bearing Axios exceptions', async function () {
    const { source, axios } = fixture();
    axios.get.rejects(
      Object.assign(new Error('secret-auth-cookie'), {
        response: { status: 401 },
        config: { headers: { cookie: 'secret-cookie' } },
      })
    );
    let error;
    try {
      await source.fetchHolders();
    } catch (caught) {
      error = caught;
    }
    expect(error.message).to.include('HTTP 401');
    expect(error.message).to.not.include('secret');
  });

  it('does not treat a login page or a timeout as a successful empty refresh', async function () {
    const { source, axios } = fixture();
    for (const response of [{ data: '<html>Log in</html>' }, null]) {
      if (response) axios.get.resolves(response);
      else
        axios.get.rejects(
          new Error('Timeout with credential-bearing request attached')
        );
      let error;
      try {
        await source.fetchHolders();
      } catch (caught) {
        error = caught;
      }
      expect(error).to.have.property('message');
    }
  });
});
