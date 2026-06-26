import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRepo } from '../core/repo.js';

// Mocka o Octokit p/ não tocar a rede: `rest.issues.get` devolve o corpo da issue.
const { issuesGet } = vi.hoisted(() => ({ issuesGet: vi.fn() }));
vi.mock('octokit', () => ({
  Octokit: vi.fn(function () {
    return { rest: { issues: { get: issuesGet } } };
  }),
}));

import { issueBody } from './issue.js';

const githubRepo: ResolvedRepo = {
  root: '/repo',
  identity: { kind: 'github', owner: 'rfl-designer', name: 'skanner' },
  profile: 'flat',
  modularBaseDir: 'app/Contexts',
  source: { profile: 'auto' },
  autoWatch: false,
};
const localOnlyRepo: ResolvedRepo = { ...githubRepo, identity: { kind: 'local-only' } };

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skanner-issue-'));
  process.env.SKANNER_CONFIG_DIR = dir;
  issuesGet.mockReset();
});

afterEach(async () => {
  delete process.env.SKANNER_CONFIG_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

const withToken = async () =>
  fs.writeFile(path.join(dir, 'token'), 'ghp_valid', { mode: 0o600 });

describe('issue.issueBody', () => {
  it('com PAT e identidade GitHub: devolve o corpo da issue', async () => {
    await withToken();
    issuesGet.mockResolvedValue({ data: { body: 'PORQUE_DA_ISSUE' } });

    expect(await issueBody(githubRepo, 47)).toBe('PORQUE_DA_ISSUE');
    expect(issuesGet).toHaveBeenCalledWith({ owner: 'rfl-designer', repo: 'skanner', issue_number: 47 });
  });

  it('repo local-only: null, sem tocar o Octokit', async () => {
    await withToken();
    expect(await issueBody(localOnlyRepo, 47)).toBeNull();
    expect(issuesGet).not.toHaveBeenCalled();
  });

  it('sem PAT: null, sem tocar o Octokit', async () => {
    expect(await issueBody(githubRepo, 47)).toBeNull();
    expect(issuesGet).not.toHaveBeenCalled();
  });

  it('falha do Octokit (404/rede): degrada para null', async () => {
    await withToken();
    issuesGet.mockRejectedValue(new Error('Not Found'));
    expect(await issueBody(githubRepo, 999)).toBeNull();
  });

  it('corpo vazio/ausente: null', async () => {
    await withToken();
    issuesGet.mockResolvedValue({ data: { body: '   ' } });
    expect(await issueBody(githubRepo, 47)).toBeNull();
  });
});
