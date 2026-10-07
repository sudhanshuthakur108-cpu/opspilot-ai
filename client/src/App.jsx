import HealthStatus from './features/health/HealthStatus.jsx';

export default function App() {
  return (
    <>
      <header className="site-header">
        <div className="container">
          <p className="site-header__name">OpsPilot AI</p>
        </div>
      </header>

      <main className="container">
        <h1>Operations management for teams</h1>
        <p className="lead">
          OpsPilot AI is in early development. Customers, orders, tasks and AI-assisted features are planned but
          not built yet.
        </p>

        <HealthStatus />
      </main>
    </>
  );
}
