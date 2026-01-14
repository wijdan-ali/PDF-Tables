export const SIDEBAR_TABLES_CACHE_KEY = 'pdf-tables:sidebar-tables-cache'
export const AI_PROVIDER_STORAGE_KEY = 'pdf-tables:ai-provider'
export const SIDEBAR_COLLAPSED_KEY = 'pdf-tables:sidebar-collapsed'

export const USER_INITIAL_CACHE_KEY = 'pdf-tables:user-initial-cache'
export const FIRST_NAME_CACHE_KEY = 'pdf-tables:first-name-cache'
export const GREETING_CACHE_KEY = 'pdf-tables:greeting-cache'

export function rowOrderStorageKey(tableId: string) {
  return `pdf-tables:row-order:${tableId}`
}

