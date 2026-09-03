export function useDocsSearch() {
  const open = useState('docs-search-open', () => false)

  function openSearch() {
    open.value = true
  }

  function closeSearch() {
    open.value = false
  }

  function toggleSearch() {
    open.value = !open.value
  }

  return { open, openSearch, closeSearch, toggleSearch }
}

export function useDocsSidebar() {
  const open = useState('docs-sidebar-open', () => false)

  function openSidebar() {
    open.value = true
  }

  function closeSidebar() {
    open.value = false
  }

  function toggleSidebar() {
    open.value = !open.value
  }

  return { open, openSidebar, closeSidebar, toggleSidebar }
}
