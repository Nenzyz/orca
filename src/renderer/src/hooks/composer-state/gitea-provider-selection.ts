import { useCallback } from 'react'
import type { GiteaWorkItem } from '../../../../shared/gitea-types'
import { toGiteaLinkedWorkItem } from '@/components/sidebar/folder-workspace-composer-helpers'
import { getLinkedWorkItemSuggestedName, getLinkedWorkItemWorkspaceName } from '@/lib/new-workspace'
import { shouldApplyWorkspaceSourceAutoName } from '../../../../shared/new-workspace/workspace-source'
import type { ComposerModel } from './composer-model'
import type { GitLabProviderSelectionInput } from './gitlab-provider-selection'

type GiteaProviderSelectionInput = Pick<
  GitLabProviderSelectionInput,
  | 'branchAutoNameRef'
  | 'clearLinkedGiteaItems'
  | 'lastAutoNameRef'
  | 'linkedWorkItem'
  | 'name'
  | 'setBranchNameOverride'
  | 'setBranchNameOverridePreservesNameEdits'
  | 'setCompareBaseRef'
  | 'setForkPushWarning'
  | 'setLinkedGitLabIssue'
  | 'setLinkedGitLabMR'
  | 'setLinkedIssue'
  | 'setLinkedPR'
  | 'setLinkedTaskSourceContext'
  | 'setLinkedWorkItem'
  | 'setName'
  | 'setStartFromResetHint'
  | 'smartSourceSelectionRef'
> &
  Pick<ComposerModel, 'setLinkedGiteaIssue' | 'setLinkedGiteaPR'>

export function useGiteaProviderSelection(input: GiteaProviderSelectionInput) {
  const {
    branchAutoNameRef,
    lastAutoNameRef,
    linkedWorkItem,
    name,
    setBranchNameOverride,
    setBranchNameOverridePreservesNameEdits,
    setCompareBaseRef,
    setForkPushWarning,
    setLinkedGiteaIssue,
    setLinkedGiteaPR,
    setLinkedGitLabIssue,
    setLinkedGitLabMR,
    setLinkedIssue,
    setLinkedPR,
    setLinkedTaskSourceContext,
    setLinkedWorkItem,
    setName,
    setStartFromResetHint,
    smartSourceSelectionRef
  } = input

  // Why: the other providers' hidden slots must clear so stale identity cannot win review routing.
  const handleSmartGiteaItemSelect = useCallback(
    (item: GiteaWorkItem): void => {
      smartSourceSelectionRef.current = null
      setLinkedGiteaIssue(item.type === 'issue' ? item.number : null)
      setLinkedGiteaPR(item.type === 'pr' ? item.number : null)
      setLinkedGitLabIssue(null)
      setLinkedGitLabMR(null)
      setLinkedIssue('')
      setLinkedPR(null)
      setLinkedTaskSourceContext(null)
      setLinkedWorkItem(toGiteaLinkedWorkItem(item))
      const nextName =
        getLinkedWorkItemWorkspaceName({
          type: item.type,
          provider: 'gitea',
          number: item.number,
          title: item.title
        })?.seedName ?? getLinkedWorkItemSuggestedName({ title: item.title })
      if (
        nextName &&
        shouldApplyWorkspaceSourceAutoName({
          currentName: name,
          lastAutoName: lastAutoNameRef.current,
          lookupTextIsQuery: !linkedWorkItem
        })
      ) {
        setName(nextName)
        lastAutoNameRef.current = nextName
      }
      // Why: a Gitea PR does not resolve its head here, so the workspace starts from the repo's default base.
      setCompareBaseRef(undefined)
      setStartFromResetHint(null)
      setBranchNameOverride(undefined)
      setBranchNameOverridePreservesNameEdits(false)
      setForkPushWarning(null)
      branchAutoNameRef.current = ''
    },
    [
      branchAutoNameRef,
      lastAutoNameRef,
      linkedWorkItem,
      name,
      setBranchNameOverride,
      setBranchNameOverridePreservesNameEdits,
      setCompareBaseRef,
      setForkPushWarning,
      setLinkedGiteaIssue,
      setLinkedGiteaPR,
      setLinkedGitLabIssue,
      setLinkedGitLabMR,
      setLinkedIssue,
      setLinkedPR,
      setLinkedTaskSourceContext,
      setLinkedWorkItem,
      setName,
      setStartFromResetHint,
      smartSourceSelectionRef
    ]
  )

  return { handleSmartGiteaItemSelect }
}
