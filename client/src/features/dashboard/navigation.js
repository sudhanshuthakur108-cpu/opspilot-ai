// Sidebar entries, grouped into sections. An entry without an `href` is shown as upcoming and
// gets one once its page is built (see PAGES in Dashboard.jsx).
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
