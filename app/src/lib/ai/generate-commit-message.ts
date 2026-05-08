import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'
import { DiffSelectionType } from '../../models/diff'
import { getWorkingDirectoryDiff } from '../git/diff'
import {
  buildAICommitMessagePrompt,
  createOpenRouterAICommitMessageProvider,
  IAICommitMessageDiff,
} from './commit-message'
import {
  getAICommitMessageSettings,
  getAICommitMessagesEnabledForRepository,
  hasUsableAICommitMessageSettings,
} from './commit-message-settings'

export async function generateAICommitMessage(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>
) {
  const settings = await getAICommitMessageSettings()

  if (!getAICommitMessagesEnabledForRepository(repository)) {
    throw new Error(
      'AI commit messages are disabled for this repository. Enable them in Repository settings.'
    )
  }

  if (!hasUsableAICommitMessageSettings(settings, repository)) {
    throw new Error('Configure AI commit messages in Preferences first.')
  }

  const selectedFiles = files.filter(
    file => file.selection.getSelectionType() !== DiffSelectionType.None
  )

  if (selectedFiles.length === 0) {
    throw new Error('Select at least one changed file first.')
  }

  const changes = new Array<IAICommitMessageDiff>()

  for (const file of selectedFiles) {
    const diff = await getWorkingDirectoryDiff(repository, file)
    changes.push({ path: file.path, selection: file.selection, diff })
  }

  const prompt = buildAICommitMessagePrompt(changes)
  const provider = createOpenRouterAICommitMessageProvider(settings)

  return provider.generate(prompt)
}
