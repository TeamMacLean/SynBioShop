const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const credentials = require('../../lib/budgetHolderCredentials');

const age = process.env.BUDGET_HOLDER_AGE_BIN || 'age';
const keygen = process.env.BUDGET_HOLDER_AGE_KEYGEN_BIN || 'age-keygen';
let available = true;
try {
  execFileSync(age, ['--version'], { stdio: 'ignore' });
  execFileSync(keygen, ['--version'], { stdio: 'ignore' });
} catch (error) {
  available = false;
}

// Exercise the actual encryption format/tool, not a mocked crypto round trip.
(available ? describe : describe.skip)(
  'Budget-holder encrypted storage (requires age)',
  function () {
    this.timeout(15000);
    let temporary;
    let root;
    let lookup;
    let original;
    const secret = ' Example: password with "quotes", £ and spaces ';

    beforeEach(async function () {
      temporary = await fs.mkdtemp(
        path.join(os.tmpdir(), 'synbioshop-credential-test-')
      );
      root = path.join(temporary, 'repo');
      await fs.mkdir(root, { mode: 0o700 });
      lookup = {
        url: 'https://intranet.example/costcentres/',
        username: 'test-account',
        password: secret,
        identityFile: path.join(temporary, 'private', 'identity.key'),
        proxyMode: 'direct',
        headers: { authorization: 'stale-auth', cookie: 'stale-cookie' },
      };
      original = { lookupBudget: lookup, unrelated: 'keep this setting' };
      await fs.writeFile(
        path.join(root, 'config.json'),
        JSON.stringify(original),
        { mode: 0o600 }
      );
    });

    afterEach(async function () {
      await fs.rm(temporary, { recursive: true, force: true });
    });

    async function readConfig() {
      return JSON.parse(
        await fs.readFile(path.join(root, 'config.json'), 'utf8')
      );
    }

    async function failure(action) {
      try {
        await action();
      } catch (error) {
        return error;
      }
      throw new Error('Expected the operation to fail');
    }

    it('migrates through real age encryption and removes only the saved budget credentials', async function () {
      const files = await credentials.migrateCredentials({}, root);
      const config = await readConfig();
      expect(config.unrelated).to.equal(original.unrelated);
      expect(config.lookupBudget).to.not.have.property('password');
      expect(config.lookupBudget.headers).to.deep.equal({});
      expect(await fs.readFile(files.credentialsFile, 'utf8')).to.not.include(
        secret
      );
      expect(
        await fs.readFile(path.join(root, 'config.json'), 'utf8')
      ).to.not.include(secret);
      const loaded = await credentials.loadCredentials(
        config.lookupBudget,
        root
      );
      expect(loaded.password).to.equal(secret);
      expect(loaded.username).to.equal('test-account');
      expect(loaded.headers).to.deep.equal({});
      expect((await fs.stat(files.identityFile)).mode & 0o777).to.equal(0o600);
      expect(
        (await fs.stat(path.dirname(files.identityFile))).mode & 0o777
      ).to.equal(0o700);
      expect((await fs.stat(files.credentialsFile)).mode & 0o777).to.equal(
        0o600
      );
      expect(await fs.readdir(path.join(root, 'tmp'))).to.deep.equal([]);
      expect(await fs.readdir(path.join(root, 'secrets'))).to.deep.equal([
        'budget-holders.age',
      ]);
    });

    it('updates a password without replacing the host identity, and can migrate again safely', async function () {
      const files = await credentials.saveCredentials(lookup, root);
      const identity = await fs.readFile(files.identityFile, 'utf8');
      await credentials.saveCredentials(
        { ...lookup, password: 'replacement password' },
        root
      );
      await credentials.migrateCredentials({}, root);
      expect(await fs.readFile(files.identityFile, 'utf8')).to.equal(identity);
      expect(
        (
          await credentials.loadCredentials(
            (await readConfig()).lookupBudget,
            root
          )
        ).password
      ).to.equal('replacement password');
    });

    it('migrates a legacy Basic header without retaining its encoded password or cookie', async function () {
      delete original.lookupBudget.password;
      original.lookupBudget.headers.authorization = `Basic ${Buffer.from(`test-account:${secret}`).toString('base64')}`;
      await fs.writeFile(
        path.join(root, 'config.json'),
        JSON.stringify(original)
      );
      await credentials.migrateCredentials({}, root);
      const config = await readConfig();
      expect(config.lookupBudget.headers).to.deep.equal({});
      expect(
        (await credentials.loadCredentials(config.lookupBudget, root)).password
      ).to.equal(secret);
    });

    it('refuses keys inside the repository without deleting the original password', async function () {
      const error = await failure(function () {
        return credentials.saveCredentials(
          {
            ...lookup,
            identityFile: path.join(root, 'private', 'identity.key'),
          },
          root
        );
      });
      expect(error.message).to.include('outside');
      expect(await readConfig()).to.deep.equal(original);
    });

    it('refuses to overwrite the config or key with encrypted credential data', async function () {
      for (const settings of [
        { credentialsFile: 'config.json' },
        {
          credentialsFile: path.join(temporary, 'private', 'same.age'),
          identityFile: path.join(temporary, 'private', 'same.age'),
        },
      ]) {
        const error = await failure(function () {
          return credentials.saveCredentials({ ...lookup, ...settings }, root);
        });
        expect(error.message).to.include('separate .age file');
        expect(await readConfig()).to.deep.equal(original);
      }
    });

    it('rejects readable-by-others keys and directories', async function () {
      const files = await credentials.saveCredentials(lookup, root);
      const saved = (await readConfig()).lookupBudget;
      await fs.chmod(files.identityFile, 0o644);
      expect(
        (
          await failure(function () {
            return credentials.loadCredentials(saved, root);
          })
        ).message
      ).to.include('0600');
      await fs.chmod(files.identityFile, 0o600);
      await fs.chmod(path.dirname(files.identityFile), 0o755);
      expect(
        (
          await failure(function () {
            return credentials.loadCredentials(saved, root);
          })
        ).message
      ).to.include('0700');
    });

    it('rejects a symlinked key and a key directory resolving inside the repository', async function () {
      const files = await credentials.saveCredentials(lookup, root);
      const saved = (await readConfig()).lookupBudget;
      const alias = path.join(path.dirname(files.identityFile), 'alias.key');
      await fs.symlink(files.identityFile, alias);
      expect(
        (
          await failure(function () {
            return credentials.loadCredentials(
              { ...saved, identityFile: alias },
              root
            );
          })
        ).message
      ).to.include('regular');
      const inner = path.join(root, 'inner');
      const outside = path.join(temporary, 'outside');
      await fs.mkdir(inner, { mode: 0o700 });
      await fs.symlink(inner, outside);
      expect(
        (
          await failure(function () {
            return credentials.saveCredentials(
              { ...lookup, identityFile: path.join(outside, 'key') },
              root
            );
          })
        ).message
      ).to.include('outside');
    });

    it('rejects a wrong key or damaged file without falling back to a plaintext password', async function () {
      const files = await credentials.saveCredentials(lookup, root);
      const saved = {
        ...(await readConfig()).lookupBudget,
        password: 'must-not-be-used',
      };
      const ciphertext = await fs.readFile(files.credentialsFile, 'utf8');
      const offset = Math.floor(ciphertext.length / 2);
      await fs.writeFile(
        files.credentialsFile,
        ciphertext.slice(0, offset) +
          (ciphertext[offset] === 'A' ? 'B' : 'A') +
          ciphertext.slice(offset + 1)
      );
      const corrupt = await failure(function () {
        return credentials.loadCredentials(saved, root);
      });
      expect(corrupt.message).to.include('age failed');
      expect(corrupt.message).to.not.include(secret);
      await fs.writeFile(files.credentialsFile, ciphertext);
      const wrongKey = path.join(path.dirname(files.identityFile), 'wrong.key');
      await fs.writeFile(
        wrongKey,
        execFileSync(keygen, [], { stdio: ['pipe', 'pipe', 'ignore'] }),
        { mode: 0o600 }
      );
      expect(
        (
          await failure(function () {
            return credentials.loadCredentials(
              { ...saved, identityFile: wrongKey },
              root
            );
          })
        ).message
      ).to.include('age failed');
    });

    it('binds credentials to the intended HTTPS origin and sanitises invalid decrypted JSON', async function () {
      const files = await credentials.saveCredentials(lookup, root);
      const saved = (await readConfig()).lookupBudget;
      expect(
        (
          await failure(function () {
            return credentials.loadCredentials(
              { ...saved, url: 'https://different.example' },
              root
            );
          })
        ).message
      ).to.include('another source');
      const recipient = execFileSync(keygen, ['-y', files.identityFile], {
        encoding: 'utf8',
      }).trim();
      const encrypted = execFileSync(
        age,
        ['--encrypt', '--armor', '--recipient', recipient],
        { input: `{"password":"${secret}`, stdio: ['pipe', 'pipe', 'ignore'] }
      );
      await fs.writeFile(files.credentialsFile, encrypted);
      const error = await failure(function () {
        return credentials.loadCredentials(saved, root);
      });
      expect(error.message).to.include('not valid credential JSON');
      expect(error.message).to.not.include(secret);
    });

    it('preserves the original config when encryption cannot run', async function () {
      const previous = process.env.BUDGET_HOLDER_AGE_BIN;
      try {
        process.env.BUDGET_HOLDER_AGE_BIN = path.join(temporary, 'missing-age');
        const error = await failure(function () {
          return credentials.saveCredentials(lookup, root);
        });
        expect(error.message).to.include('install age');
        expect(await readConfig()).to.deep.equal(original);
      } finally {
        if (previous === undefined) delete process.env.BUDGET_HOLDER_AGE_BIN;
      else {
        // This serial test owns the override until this restoration.
        // eslint-disable-next-line require-atomic-updates
        process.env.BUDGET_HOLDER_AGE_BIN = previous;
      }
      }
    });
  }
);
