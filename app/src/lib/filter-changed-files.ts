export function filterChangedFilesByPath<T extends { readonly path: string }>(
  files: ReadonlyArray<T>,
  filterText: string
): ReadonlyArray<T> {
  const terms = filterText
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 0)

  if (terms.length === 0) {
    return files
  }

  return files.filter(file => {
    const path = file.path.toLocaleLowerCase()
    return terms.every(term => path.includes(term))
  })
}
