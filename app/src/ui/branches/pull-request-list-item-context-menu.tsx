import { IMenuItem } from '../../lib/menu-item'

interface IPullRequestContextMenuConfig {
  onViewPullRequestOnGitHub?: () => void
  onReviewPullRequest?: () => void
}

export function generatePullRequestContextMenuItems(
  config: IPullRequestContextMenuConfig
): IMenuItem[] {
  const { onViewPullRequestOnGitHub, onReviewPullRequest } = config
  const items = new Array<IMenuItem>()

  if (onReviewPullRequest !== undefined) {
    items.push({
      label: 'Review Pull Request…',
      action: () => onReviewPullRequest(),
    })
  }

  if (onViewPullRequestOnGitHub !== undefined) {
    items.push({
      label: 'View Pull Request on GitHub',
      action: () => onViewPullRequestOnGitHub(),
    })
  }

  return items
}
