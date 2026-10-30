import type { TaskPageProviderMetadataModel } from './use-task-page-provider-metadata'
import { useEffect } from 'react'
import { giteaApiFor } from '@/runtime/gitea-owner-api'
import { mapSettledWithConcurrency } from '../../../../shared/map-with-concurrency'
import type { Repo } from '../../../../shared/repo-types'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { ClassifiedError } from '../../../../shared/classified-error'
import type { GiteaWorkItem } from '../../../../shared/gitea-types'
import type { GiteaRepoSelectorArgs } from '../../../../preload/api/gitea-api'
import {
  getTaskPageRepoSourceContext,
  isGitLabIssueFilter,
  isGitLabMRFilter
} from './task-page-source-context'
import { giteaIssueToWorkItem } from './gitea/gitea-task-items'

// Leave headroom below the runtime RPC foreground concurrency of eight for sidebar and other callers.
export const GITEA_TASK_FETCH_CONCURRENCY = 6

function giteaTaskRepoSelector(repo: Repo): GiteaRepoSelectorArgs {
  return {
    repoPath: repo.path,
    repoId: repo.id,
    sourceContext: getTaskPageRepoSourceContext(repo, 'gitea'),
    repoOwnerExecutionHostId: getRepoExecutionHostId(repo)
  }
}

type GiteaLoadingInput = Pick<
  TaskPageProviderMetadataModel,
  | 'selectedRepos'
  | 'selectedReposKey'
  | 'primaryRepo'
  | 'taskSource'
  | 'setGiteaItems'
  | 'setGiteaLoading'
  | 'setGiteaError'
  | 'giteaRefreshNonce'
  | 'giteaView'
  | 'setGiteaNotifications'
  | 'setGiteaNotificationsLoading'
  | 'activeGiteaFilter'
>

type RepoFetchResult = {
  repo: Repo
  items: GiteaWorkItem[]
  error?: ClassifiedError
}

export function useTaskPageGiteaLoading<Model extends GiteaLoadingInput>(model: Model): Model {
  const {
    selectedRepos,
    selectedReposKey,
    primaryRepo,
    taskSource,
    setGiteaItems,
    setGiteaLoading,
    setGiteaError,
    giteaRefreshNonce,
    giteaView,
    setGiteaNotifications,
    setGiteaNotificationsLoading,
    activeGiteaFilter
  } = model
  // Fetch issues and PRs separately so a failure stays scoped to its tab.
  useEffect(() => {
    if (taskSource !== 'gitea' || giteaView === 'notifications') {
      return
    }
    const activeIssueFilter =
      giteaView === 'issues' && isGitLabIssueFilter(activeGiteaFilter) ? activeGiteaFilter : null
    const activePRFilter =
      giteaView === 'prs' && isGitLabMRFilter(activeGiteaFilter) ? activeGiteaFilter : null
    if (
      (giteaView === 'issues' && !activeIssueFilter) ||
      (giteaView === 'prs' && !activePRFilter)
    ) {
      return
    }
    if (selectedRepos.length === 0) {
      setGiteaItems([])
      setGiteaLoading(false)
      setGiteaError(null)
      return
    }
    let stale = false
    setGiteaLoading(true)
    setGiteaError(null)
    const fetchItems = async (repo: Repo): Promise<RepoFetchResult> => {
      const selector = giteaTaskRepoSelector(repo)
      if (giteaView === 'issues') {
        const result = await giteaApiFor(selector).listIssues({
          ...selector,
          state: 'opened',
          assignee: activeIssueFilter === 'assigned-to-me' ? '@me' : undefined,
          limit: 50
        })
        return {
          repo,
          items: result.items.map((issue) => giteaIssueToWorkItem(issue, repo.id)),
          error: result.error
        }
      }
      const result = await giteaApiFor(selector).listPRs({
        ...selector,
        state: activePRFilter ?? 'opened',
        page: 1,
        perPage: 50
      })
      return { repo, items: result.items, error: result.error }
    }
    void mapSettledWithConcurrency(selectedRepos, GITEA_TASK_FETCH_CONCURRENCY, async (repo) => {
      // Why: a stale selection's results are discarded below, so skip the repos not yet started.
      const result: RepoFetchResult = stale ? { repo, items: [] } : await fetchItems(repo)
      // Non-Gitea repos in mixed selections return not_found; omit them without a false failure banner.
      return result.error?.type === 'not_found' ? { ...result, error: undefined } : result
    })
      .then((results) => {
        if (stale) {
          return
        }
        const merged: GiteaWorkItem[] = []
        const errs: string[] = []
        for (const r of results) {
          if (r.status !== 'fulfilled') {
            errs.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
            continue
          }
          // Why the host: a twin's two rows share the id, so only the stamp names the row that answered.
          const repoHostId = getRepoExecutionHostId(r.value.repo)
          for (const item of r.value.items) {
            merged.push({ ...item, repoId: r.value.repo.id, repoHostId })
          }
          if (r.value.error) {
            errs.push(r.value.error.message)
          }
        }
        merged.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
        setGiteaItems(merged)
        // Show failures only when no usable rows remain; mixed selections may include non-Gitea repos.
        if (errs.length > 0 && merged.length === 0) {
          setGiteaError(errs[0])
        }
      })
      .finally(() => {
        if (!stale) {
          setGiteaLoading(false)
        }
      })
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedReposKey covers every selectedRepos field read above; keying off the array ref would re-run on every parent render.
  }, [
    taskSource,
    giteaView,
    activeGiteaFilter,
    giteaRefreshNonce,
    selectedReposKey,
    setGiteaError,
    setGiteaItems,
    setGiteaLoading
  ])

  // Notifications are user-scoped and ignore repo/chip filters, so fetch them independently.
  useEffect(() => {
    if (taskSource !== 'gitea' || giteaView !== 'notifications') {
      return
    }
    if (!primaryRepo?.path) {
      setGiteaNotifications([])
      setGiteaNotificationsLoading(false)
      return
    }
    let stale = false
    setGiteaNotificationsLoading(true)
    void giteaApiFor(giteaTaskRepoSelector(primaryRepo))
      .notifications(giteaTaskRepoSelector(primaryRepo))
      .then((notifications) => {
        if (!stale) {
          setGiteaNotifications(notifications)
        }
      })
      .catch(() => {
        if (!stale) {
          setGiteaNotifications([])
        }
      })
      .finally(() => {
        if (!stale) {
          setGiteaNotificationsLoading(false)
        }
      })
    return () => {
      stale = true
    }
  }, [
    taskSource,
    giteaView,
    giteaRefreshNonce,
    primaryRepo,
    setGiteaNotificationsLoading,
    setGiteaNotifications
  ])
  return model
}
