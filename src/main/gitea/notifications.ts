import { requestGiteaJson } from './client'
import { resolveGiteaIssueSource } from './gitea-issue-source-resolution'
import type { GiteaRepoRef, LocalGitExecOptions } from './repository-ref'

const NOTIFICATION_LIMIT = 50

export type GiteaNotification = {
  id: number
  subjectType: string
  subjectTitle: string
  subjectUrl: string
  subjectNumber: number | null
  repositoryPath: string
  updatedAt: string
  unread: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function subjectNumber(subjectType: string, subjectUrl: string): number | null {
  const type = subjectType.toLowerCase()
  if (type !== 'issue' && type !== 'pull') {
    return null
  }
  const match = /\/(?:issues|pulls)\/(\d+)(?:$|[/?#])/i.exec(subjectUrl)
  if (!match) {
    return null
  }
  const parsed = Number(match[1])
  return Number.isInteger(parsed) ? parsed : null
}

function mapNotification(value: unknown): GiteaNotification | null {
  if (!isRecord(value)) {
    return null
  }
  const id = readNumber(value, 'id')
  const subject = isRecord(value.subject) ? value.subject : null
  const repository = isRecord(value.repository) ? value.repository : null
  if (id === null || !subject) {
    return null
  }
  const subjectType = readString(subject, 'type')
  const subjectUrl = readString(subject, 'html_url') || readString(subject, 'url')
  return {
    id,
    subjectType,
    subjectTitle: readString(subject, 'title'),
    subjectUrl,
    subjectNumber: subjectNumber(subjectType, subjectUrl),
    repositoryPath: repository ? readString(repository, 'full_name') : '',
    updatedAt: readString(value, 'updated_at'),
    unread: value.unread !== false
  }
}

export async function listGiteaNotifications(
  repoPath: string,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GiteaNotification[]> {
  const resolved = await resolveGiteaIssueSource(repoPath, undefined, connectionId, localGitOptions)
  const repo: GiteaRepoRef | null = resolved.source
  if (!repo) {
    return []
  }
  try {
    const payload = await requestGiteaJson<unknown>(repo, '/notifications', {
      searchParams: { 'status-types': 'unread', limit: NOTIFICATION_LIMIT }
    })
    return Array.isArray(payload)
      ? payload.flatMap((entry) => {
          const notification = mapNotification(entry)
          return notification ? [notification] : []
        })
      : []
  } catch {
    return []
  }
}
