const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rules = require('../../lib/budgetHolderRules');

function fixture() {
  const axios = { get: sinon.stub() };
  const getProxyForUrl = sinon.stub().returns('');
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
    'proxy-from-env': { getProxyForUrl },
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
  return { source: sandbox.module.exports, axios, config, getProxyForUrl };
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

  it('can explicitly bypass the environment proxy without consulting it', function () {
    const { source, config, getProxyForUrl } = fixture();
    const options = source.buildRequest({
      ...config.lookupBudget,
      proxyMode: 'direct',
    });
    expect(options.proxy).to.equal(false);
    expect(options.httpsAgent.options.proxyEnv).to.deep.equal({});
    expect(getProxyForUrl.called).to.equal(false);
    options.httpsAgent.destroy();
  });

  it('uses a dedicated CONNECT agent with the existing environment proxy selection', function () {
    const { source, config, getProxyForUrl } = fixture();
    for (const proxy of ['', 'http://proxy.example:8080', 'https://proxy.example:8443']) {
      getProxyForUrl.returns(proxy);
      const options = source.buildRequest(config.lookupBudget);
      expect(options.proxy).to.equal(false);
      expect(options.httpsAgent.options.proxyEnv).to.deep.equal(
        proxy ? { https_proxy: proxy } : {}
      );
      expect(options.httpsAgent.options.timeout).to.equal(20000);
      expect(options.httpsAgent.options).to.not.have.property('rejectUnauthorized');
      expect(getProxyForUrl.lastCall.args).to.deep.equal([config.lookupBudget.url]);
      options.httpsAgent.destroy();
    }
  });

  it('rejects malformed or unsupported proxies without leaking proxy credentials', function () {
    const { source, config, getProxyForUrl } = fixture();
    for (const proxy of ['http://user:hidden-secret@host:invalid', 'socks5://user:hidden-secret@host:1080']) {
      getProxyForUrl.returns(proxy);
      expect(() => source.buildRequest(config.lookupBudget)).to.throw(
        'Intranet request proxy configuration is invalid. Use an HTTP(S) proxy URL.'
      );
    }
  });

  it('destroys its request agent on both success and failure', async function () {
    const { source, axios } = fixture();
    const destroys = [];
    axios.get.callsFake(async function (url, options) {
      destroys.push(sinon.spy(options.httpsAgent, 'destroy'));
      if (destroys.length === 2) throw { code: 'ERR_PROXY_TUNNEL' };
      return { data: '<select name="BH"><option value="testuser">Test User (TSL)</option></select>' };
    });
    await source.fetchHolders();
    let failure;
    try { await source.fetchHolders(); } catch (error) { failure = error; }
    expect(failure.code).to.equal('ERR_PROXY_TUNNEL');
    expect(destroys.every(spy => spy.calledOnce)).to.equal(true);
  });

  describe('real loopback-only proxy transport', function () {
    let server;
    let sockets;
    let context;
    let requests;

    beforeEach(async function () {
      context = fixture();
      sockets = new Set();
      requests = [];
      server = require('http').createServer(function (request, response) {
        requests.push(request);
        response.writeHead(400).end();
      });
      server.on('connection', function (socket) {
        sockets.add(socket);
        socket.on('error', () => {});
        socket.on('close', () => sockets.delete(socket));
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      context.getProxyForUrl.returns(`http://127.0.0.1:${server.address().port}`);
      // Only synthetic credentials; no production config or remote requests.
      context.config.lookupBudget.username = 'test-user';
      context.config.lookupBudget.password = 'test-password';
      context.axios.get.callsFake(function (url, options) {
        options.timeout = 200;
        options.httpsAgent.options.timeout = 200;
        return require('axios').get(url, options);
      });
    });

    afterEach(async function () {
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    });

    async function failure() {
      try { await context.source.fetchHolders(); } catch (error) { return error; }
      throw new Error('Expected the local proxy test to fail');
    }

    it('sends CONNECT without origin credentials and sanitises a tunnel rejection', async function () {
      server.on('connect', function (request, socket) {
        requests.push(request);
        socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
      });
      const error = await failure();
      expect(error.code).to.equal('ERR_PROXY_TUNNEL');
      expect(requests).to.have.lengthOf(1);
      expect(requests[0].method).to.equal('CONNECT');
      expect(requests[0].url).to.equal('intranet.example:443');
      expect(requests[0].headers).to.not.have.property('authorization');
      expect(requests[0].headers).to.not.have.property('cookie');
      expect(error.message).to.not.include('test-password');
    });

    it('starts TLS, not a credential-bearing HTTP GET, after CONNECT succeeds', async function () {
      let firstRecord;
      server.on('connect', function (request, socket) {
        requests.push(request);
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        socket.once('data', function (data) {
          firstRecord = data;
          socket.destroy();
        });
      });
      await failure();
      expect(requests[0].method).to.equal('CONNECT');
      expect(firstRecord[0]).to.equal(22); // TLS handshake record.
      expect(firstRecord.includes(Buffer.from('Authorization:'))).to.equal(false);
      expect(firstRecord.includes(Buffer.from('test-password'))).to.equal(false);
    });

    it('bounds a stalled CONNECT before an HTTPS socket exists', async function () {
      server.on('connect', function (request, socket) {
        requests.push(request);
        socket.resume();
      });
      const start = Date.now();
      const error = await failure();
      expect(error.code).to.equal('ECONNABORTED');
      expect(requests[0].method).to.equal('CONNECT');
      expect(Date.now() - start).to.be.lessThan(2000);
    });
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
