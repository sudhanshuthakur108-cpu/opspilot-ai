import { setThemePreference, useTheme } from '../theme.js';
import { Icon } from './Icon.jsx';

// Switches between light and dark. The full choice, including following the system, is in Settings.
export function ThemeToggle() {
  const { theme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => setThemePreference(next)}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
