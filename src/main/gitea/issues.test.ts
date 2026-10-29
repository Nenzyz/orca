import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  requestGiteaJsonMock,
  requestGiteaJsonWithHeadersMock,
  getGiteaIssueRepoRefMock,
  resolveGiteaIssueSourceMock,
  getAuthenticatedViewerMock
} = vi.hoisted(() => ({
  requestGiteaJsonMock: vi.fn(),
  requestGiteaJsonWithHeadersMock: vi.fn(),
  getGiteaIssueRepoRefMock: vi.fn(),
  resolveGiteaIssueSourceMock: vi.fn(),
  getAuthenticatedViewerMock: vi.fn()
}))

vi.mock('./client', () => ({
  requestGiteaJson: requestGiteaJsonMock,
  requestGiteaJsonWithHeaders: requestGiteaJsonWithHeadersMock
}))

vi.mock('./gitea-issue-source-resolution', () => ({
  getGiteaIssueRepoRef: getGiteaIssueRepoRefMock,
  resolveGiteaIssueSource: resolveGiteaIssueSourceMock
}))

vi.mock('./gitea-auth-and-rate-limit', () => ({
  getAuthenticatedViewer: getAuthenticatedViewerMock
}))

import { getGiteaIssue, listGiteaIssues } from './issues'

const repo = {
  host: 'git.example.com',
  owner: 'team',
  repo: 'widgets',
  apiBaseUrl: 'https://git.example.com/api/v1',
  webBaseUrl: 'https://git.example.com',
  loginName: 'work'
}

function rawIssue(overrides: Record<string, unknown> = {}) {
  return {
    number: 12,
    title: 'Broken widget',
    body: 'Steps to reproduce',
    state: 'open',
    html_url: 'https://git.example.com/team/widgets/issues/12',
    updated_at: '2026-05-15T00:00:00Z',
    user: { login: 'octo' },
    labels: [{ name: 'bug' }, 'ui'],
    assignees: [{ login: 'ada' }, { username: 'grace' }],
    ...overrides
  }
}

describe('getGiteaIssue', () => {
  beforeEach(() => {
    requestGiteaJsonMock.mockReset()
    getGiteaIssueRepoRefMock.mockReset()
    getGiteaIssueRepoRefMock.mockResolvedValue(repo)
  })

  it('maps a repository issue to GiteaIssueInfo', async () => {
    requestGiteaJsonMock.mockResolvedValue(rawIssue())

    await expect(getGiteaIssue('/repo', 12, 'conn-1', { wslDistro: 'Ubuntu' })).resolves.toEqual({
      number: 12,
      title: 'Broken widget',
      body: 'Steps to reproduce',
      state: 'open',
      url: 'https://git.example.com/team/widgets/issues/12',
      author: 'octo',
      labels: ['bug', 'ui'],
      assignees: ['ada', 'grace'],
      updatedAt: '2026-05-15T00:00:00Z'
    })
    expect(getGiteaIssueRepoRefMock).toHaveBeenCalledWith('/repo', 'conn-1', {
      wslDistro: 'Ubuntu'
    })
    expect(requestGiteaJsonMock).toHaveBeenCalledWith(repo, '/repos/team/widgets/issues/12', {
      allowNotFound: true
    })
  })

  it('returns null when the issue is missing', async () => {
    requestGiteaJsonMock.mockResolvedValue(null)

    await expect(getGiteaIssue('/repo', 404)).resolves.toBeNull()
  })

  it('returns null when the shared index is a pull request', async () => {
    requestGiteaJsonMock.mockResolvedValue(rawIssue({ pull_request: {} }))

    await expect(getGiteaIssue('/repo', 12)).resolves.toBeNull()
  })
})

describe('listGiteaIssues', () => {
  beforeEach(() => {
    requestGiteaJsonWithHeadersMock.mockReset()
    resolveGiteaIssueSourceMock.mockReset()
    getAuthenticatedViewerMock.mockReset()
    resolveGiteaIssueSourceMock.mockResolvedValue({ source: repo, fellBack: false })
    requestGiteaJsonWithHeadersMock.mockResolvedValue({
      data: [rawIssue(), rawIssue({ number: 8, title: 'A pull request', pull_request: {} })],
      headers: { 'x-total-count': '2' }
    })
  })

  it('lists issues with type=issues and drops pull-request rows', async () => {
    await expect(listGiteaIssues('/repo', 20, 'origin', 'opened')).resolves.toMatchObject({
      items: [{ number: 12, title: 'Broken widget', state: 'open' }],
      page: 1,
      perPage: 20,
      totalCount: 2,
      totalPages: 1
    })
    expect(requestGiteaJsonWithHeadersMock).toHaveBeenCalledWith(
      repo,
      '/repos/team/widgets/issues',
      expect.objectContaining({
        searchParams: { type: 'issues', state: 'open', page: 1, limit: 20 }
      })
    )
  })

  it('resolves assignee @me to assigned_by for the authenticated viewer', async () => {
    getAuthenticatedViewerMock.mockResolvedValue({ username: 'ada', email: null })
    requestGiteaJsonWithHeadersMock.mockResolvedValue({
      data: [],
      headers: { 'x-total-count': '0' }
    })

    await listGiteaIssues('/repo', 10, undefined, 'opened', '@me', 'conn-1')

    expect(getAuthenticatedViewerMock).toHaveBeenCalledWith('work')
    expect(requestGiteaJsonWithHeadersMock).toHaveBeenCalledWith(
      repo,
      '/repos/team/widgets/issues',
      expect.objectContaining({
        searchParams: expect.objectContaining({ type: 'issues', assigned_by: 'ada', limit: 10 })
      })
    )
  })

  it('computes totalCount and totalPages from x-total-count', async () => {
    requestGiteaJsonWithHeadersMock.mockResolvedValue({
      data: [rawIssue()],
      headers: { 'x-total-count': '41' }
    })

    await expect(
      listGiteaIssues('/repo', 20, undefined, 'closed', 'ada', null, {}, 2, '  widgets  ')
    ).resolves.toMatchObject({
      page: 2,
      perPage: 20,
      totalCount: 41,
      totalPages: 3
    })
    expect(requestGiteaJsonWithHeadersMock).toHaveBeenCalledWith(
      repo,
      '/repos/team/widgets/issues',
      expect.objectContaining({
        searchParams: {
          type: 'issues',
          state: 'closed',
          page: 2,
          limit: 20,
          assigned_by: 'ada',
          q: 'widgets'
        }
      })
    )
  })
})
