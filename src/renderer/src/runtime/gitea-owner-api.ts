import type { GiteaApi } from '../../../preload/api/gitea-api'
import { createRuntimeGiteaApi } from './runtime-gitea-api'
import { callRuntimeRpc } from './runtime-rpc-client'
import { forgeCredentialTarget, type ForgeRepoSelector } from './forge-credential-target'

const GITEA_RPC_TIMEOUT_MS = 30_000

// Why: a task source names the repo by its id on the server that published it.
function withSourceRepo(params: unknown, sourceRepoId: string | null): unknown {
  return sourceRepoId && params && typeof params === 'object' && 'repo' in params
    ? { ...params, repo: `id:${sourceRepoId}` }
    : params
}

function runtimeGiteaApi(environmentId: string, sourceRepoId: string | null): GiteaApi {
  const target = { kind: 'environment', environmentId } as const
  return createRuntimeGiteaApi({
    call: (method, params) =>
      callRuntimeRpc(target, method, withSourceRepo(params, sourceRepoId), {
        timeoutMs: GITEA_RPC_TIMEOUT_MS
      })
  })
}

/** The `tea` API on the machine that holds the repo's Gitea credentials. */
export function giteaApiFor(selector?: ForgeRepoSelector): GiteaApi {
  if (!selector) {
    return window.api.gitea
  }
  let target: ReturnType<typeof forgeCredentialTarget>
  try {
    target = forgeCredentialTarget(selector)
  } catch (error) {
    // Why: callers chain `.then`/`await`; an unknown owner must reject, not throw synchronously.
    return createRuntimeGiteaApi({ call: () => Promise.reject(error) })
  }
  return target.kind === 'environment'
    ? runtimeGiteaApi(target.environmentId, selector.sourceContext?.repoId?.trim() || null)
    : window.api.gitea
}
