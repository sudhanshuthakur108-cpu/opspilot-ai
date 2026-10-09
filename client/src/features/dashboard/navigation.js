// Sidebar entries, grouped into sections. Each `href` has a page in PAGES in Dashboard.jsx.
export const NAV_SECTIONS = [
  {
    id: 'home',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/' }],
  },
  {
    id: 'operations',
    title: 'Operations',
    items: [
      { id: 'customers', label: 'Customers', icon: 'customers', href: '/customers' },
      { id: 'orders', label: 'Orders', icon: 'orders', href: '/orders' },
      { id: 'tasks', label: 'Tasks', icon: 'tasks', href: '/tasks' },
    ],
  },
  {
    id: 'ai',
    title: 'AI',
    items: [
      { id: 'assistant', label: 'AI Assistant', icon: 'assistant', href: '/assistant' },
      { id: 'approvals', label: 'Approvals', icon: 'approvals', href: '/approvals' },
    ],
  },
  {
    id: 'workspace',
    title: 'Workspace',
    items: [
      { id: 'audit-logs', label: 'Audit Logs', icon: 'audit', href: '/audit-logs' },
      { id: 'settings', label: 'Settings', icon: 'settings', href: '/settings' },
    ],
  },
];
