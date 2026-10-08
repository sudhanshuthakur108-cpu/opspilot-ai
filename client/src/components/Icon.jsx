// 24×24 outline icons, drawn with the current text color.
const PATHS = {
  dashboard: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
  customers:
    'M15.5 19.5v-1.25a3.75 3.75 0 0 0-3.75-3.75h-4.5a3.75 3.75 0 0 0-3.75 3.75v1.25M13 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM20.5 19.5v-1.25a3.75 3.75 0 0 0-2.75-3.6M15.25 4.65a3.5 3.5 0 0 1 0 6.7',
  orders: 'M4 7.5 12 4l8 3.5v9L12 20l-8-3.5zM4 7.5l8 3.5 8-3.5M12 11v9',
  tasks: 'M5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4ZM8.5 12l2.5 2.5 4.5-5',
  assistant:
    'M11 4.5 12.6 9 17 10.5l-4.4 1.6L11 16.5l-1.6-4.4L5 10.5 9.4 9zM18 15l.75 1.75 1.75.75-1.75.75L18 20l-.75-1.75L15.5 17.5l1.75-.75z',
  approvals: 'M12 3.75 19 6.5v5c0 4.25-2.9 7.6-7 8.75-4.1-1.15-7-4.5-7-8.75v-5zM9 12l2 2 4-4.25',
  audit: 'M14 3.75H7.5A1.5 1.5 0 0 0 6 5.25v13.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V7.75zM14 3.75v4h4M9 12.25h6M9 15.75h4',
  settings: 'M4 7.5h9M17 7.5h3M15 5.5v4M4 16.5h3M11 16.5h9M9 14.5v4',
  activity: 'M3.5 12h3.75l2.5-6.5 4.5 13 2.5-6.5h3.75',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  plus: 'M12 5.5v13M5.5 12h13',
};

export function Icon({ name, size = 20 }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        d={PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
