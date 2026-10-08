// Sidebar entries, grouped into sections. Only the dashboard exists so far; an entry without an
// `href` is shown as upcoming and gets one once its page is built.
export const NAV_SECTIONS = [
  {
    id: 'home',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/' }],
  },
  {
    id: 'operations',
    title: 'Operations',
    items: [
      { id: 'customers', label: 'Customers', icon: 'customers' },
      { id: 'orders', label: 'Orders', icon: 'orders' },
      { id: 'tasks', label: 'Tasks', icon: 'tasks' },
    ],
  },
  {
    id: 'ai',
    title: 'AI',
    items: [
      { id: 'assistant', label: 'AI Assistant', icon: 'assistant' },
      { id: 'approvals', label: 'Approvals', icon: 'approvals' },
    ],
  },
  {
    id: 'workspace',
    title: 'Workspace',
    items: [
      { id: 'audit-logs', label: 'Audit Logs', icon: 'audit' },
      { id: 'settings', label: 'Settings', icon: 'settings' },
    ],
  },
];
