import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Editor } from "./Editor";
import type { DashboardData, DueState, EditorState } from "./dashboard-types";

const stateLabels: Record<DueState, string> = {
  overdue: "Overdue",
  due: "Due today",
  due_soon: "Due soon",
  upcoming: "Upcoming",
  unscheduled: "Not scheduled",
  completed: "Completed",
  paused: "Paused",
};

type WeatherResult =
  | { status: "unconfigured" | "invalid_zip" | "unavailable" }
  | { status: "ready"; stale: boolean; locationName: string; days: Array<{ date: string; code: number; label: string; high: number; low: number; precipitationChance: number | null }> };

function weatherIcon(code: number): string {
  if (code === 0) return "☀";
  if (code <= 3) return "⛅";
  if (code === 45 || code === 48) return "〰";
  if (code <= 67 || (code >= 80 && code <= 82)) return "☂";
  if (code <= 86) return "❄";
  return "⚡";
}

function formatDate(value: string | null): string {
  if (!value) return "No date set";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(year, month - 1, day),
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function LoginScreen({ configured, onAuthenticated }: { configured: boolean; onAuthenticated: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const passphrase = String(form.get("passphrase") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (!configured && passphrase !== confirmation) {
      setError("Those passphrases do not match.");
      setSaving(false);
      return;
    }
    const response = await fetch(configured ? "/api/auth/login" : "/api/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      setError(result.error ?? "The household login could not be completed.");
      setSaving(false);
      return;
    }
    onAuthenticated();
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-mark">YT</div>
        <p className="eyebrow">Private household access</p>
        <h1>{configured ? "Welcome back." : "Protect your yard."}</h1>
        <p>{configured ? "Enter the shared household passphrase to open Yard Tracker." : "Create one shared passphrase for everyone in your household. No email address or cloud account is required."}</p>
        <form onSubmit={submit}>
          <label><span>Household passphrase</span><input name="passphrase" type="password" minLength={6} maxLength={200} autoComplete={configured ? "current-password" : "new-password"} required autoFocus /></label>
          {!configured && <label><span>Confirm passphrase</span><input name="confirmation" type="password" minLength={6} maxLength={200} autoComplete="new-password" required /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={saving}>{saving ? "Opening…" : configured ? "Open Yard Tracker" : "Create household login"}</button>
        </form>
      </section>
    </main>
  );
}

function App() {
  const [auth, setAuth] = useState<{ configured: boolean; authenticated: boolean } | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState("all");
  const [status, setStatus] = useState<"all" | DueState>("all");
  const [query, setQuery] = useState("");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [weather, setWeather] = useState<WeatherResult | null>(null);

  const loadDashboard = useCallback(async () => {
    const response = await fetch("/api/dashboard");
    if (response.status === 401 || response.status === 428) {
      setAuth((current) => ({ configured: response.status === 401 || current?.configured === true, authenticated: false }));
      setDashboard(null);
      return;
    }
    if (!response.ok) throw new Error("The household dashboard could not be loaded.");
    setDashboard(await response.json() as DashboardData);
  }, []);

  const loadWeather = useCallback(async () => {
    const response = await fetch("/api/weather");
    if (response.ok) setWeather(await response.json() as WeatherResult);
  }, []);

  const refreshAll = useCallback(async () => {
    await loadDashboard();
    await loadWeather();
  }, [loadDashboard, loadWeather]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/status", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The household login status could not be loaded.");
        return response.json() as Promise<{ configured: boolean; authenticated: boolean }>;
      })
      .then(async (statusResult) => {
        setAuth(statusResult);
        if (statusResult.authenticated) await refreshAll();
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "The dashboard could not be loaded.");
      });
    return () => controller.abort();
  }, [refreshAll]);

  const visibleCards = useMemo(() => {
    if (!dashboard) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return dashboard.cards.filter((card) => {
      const matchesLocation = location === "all" || card.locationIds.includes(location);
      const matchesStatus = status === "all" || card.state === status;
      const searchable = `${card.name} ${card.description ?? ""} ${card.locationNames.join(" ")} ${card.plans.map((plan) => plan.name).join(" ")}`.toLowerCase();
      return matchesLocation && matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [dashboard, location, query, status]);

  if (error) {
    return (
      <main className="message-shell">
        <p className="eyebrow">Yard Tracker</p>
        <h1>We couldn’t open your yard.</h1>
        <p>{error} Check that the household server is running, then refresh this page.</p>
      </main>
    );
  }

  if (auth && !auth.authenticated) {
    return <LoginScreen configured={auth.configured} onAuthenticated={() => { setAuth({ configured: true, authenticated: true }); void refreshAll(); }} />;
  }

  if (!auth || !dashboard) {
    return (
      <main className="message-shell" aria-busy="true">
        <div className="loading-mark">YT</div>
        <p>Gathering today’s yard work…</p>
      </main>
    );
  }

  const attentionCount = dashboard.counts.overdue + dashboard.counts.due + dashboard.counts.due_soon;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Yard Tracker home">
          <span className="brand-mark">YT</span>
          <span>
            <strong>Yard Tracker</strong>
            <small>{dashboard.household.displayName}</small>
          </span>
        </a>
        <nav aria-label="Primary navigation">
          <a className="active" href="#yard">My yard</a>
          <a href="#activity">Activity</a>
          <button className="settings-button" type="button" onClick={() => setEditor({ kind: "settings" })}>Settings</button>
          <button className="settings-button" type="button" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); setAuth({ configured: true, authenticated: false }); setDashboard(null); }}>Lock</button>
        </nav>
      </header>

      <main id="top">
        <section className="welcome" aria-labelledby="welcome-title">
          <div>
            <p className="eyebrow">Household overview · {formatDate(dashboard.today)}</p>
            <h1 id="welcome-title">Good care,<br />kept simple.</h1>
            <p className="welcome-copy">
              Everything the yard needs, from the next feeding to the last coat of wood conditioner.
            </p>
          </div>
          <div className="today-panel">
            <div className="today-number">{attentionCount}</div>
            <div>
              <strong>{attentionCount === 1 ? "item needs" : "items need"} attention</strong>
              <span>{dashboard.counts.overdue} overdue · {dashboard.counts.due_soon + dashboard.counts.due} coming up</span>
            </div>
            <div className="weather-row">
              {weather?.status === "ready" ? <div className="forecast-wrap"><div className="forecast-heading"><strong>{weather.locationName}</strong><span>{weather.stale ? "Last available forecast" : "Five-day forecast"}</span></div><div className="forecast-days">{weather.days.map((day) => <div className="forecast-day" key={day.date}><span>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(`${day.date}T12:00:00`))}</span><b title={day.label}>{weatherIcon(day.code)}</b><strong>{day.high}°</strong><small>{day.low}° · {day.precipitationChance ?? 0}%</small></div>)}</div></div> : <><span className="weather-icon" aria-hidden="true">☀</span><div><strong>{weather?.status === "invalid_zip" ? "ZIP code not found" : weather?.status === "unavailable" ? "Forecast temporarily unavailable" : "Weather is ready to connect"}</strong><span>{dashboard.household.zipCode ? `Forecast for ${dashboard.household.zipCode}` : "Add a ZIP code in household settings"}</span></div></>}
            </div>
          </div>
        </section>

        <section className="dashboard-section" id="yard" aria-labelledby="yard-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Living inventory</p>
              <h2 id="yard-heading">Your yard</h2>
            </div>
            <div className="section-actions"><span className="result-count">{visibleCards.length} of {dashboard.cards.length} cards</span><button className="primary-button compact-button" type="button" onClick={() => setEditor({ kind: "card" })}>Add card</button></div>
          </div>

          <div className="controls" aria-label="Filter yard cards">
            <label className="search-control">
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Plants, treatments, locations…" />
            </label>
            <label>
              <span>Location</span>
              <select value={location} onChange={(event) => setLocation(event.target.value)}>
                <option value="all">Everywhere</option>
                {dashboard.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as "all" | DueState)}>
                <option value="all">All statuses</option>
                <option value="overdue">Overdue</option>
                <option value="due">Due today</option>
                <option value="due_soon">Due soon</option>
                <option value="upcoming">Upcoming</option>
                <option value="unscheduled">Not scheduled</option>
                <option value="paused">Paused</option>
              </select>
            </label>
          </div>

          {visibleCards.length > 0 ? (
            <div className="card-grid">
              {visibleCards.map((card, index) => {
                const open = expandedCard === card.id;
                const activePlans = card.plans.filter((plan) => plan.enabled);
                return (
                  <article className={`yard-card state-${card.state}`} key={card.id}>
                    <div className={`card-visual visual-${index % 6}`}>
                      {card.coverPhotoUrl ? <img src={card.coverPhotoUrl} alt="" /> : <span>{initials(card.name)}</span>}
                      <div className={`state-badge state-${card.state}`}>{stateLabels[card.state]}</div>
                    </div>
                    <div className="card-content">
                      <div className="location-line">{card.locationNames.length ? card.locationNames.join(" · ") : "No location"}</div>
                      <h3>{card.name}</h3>
                      <p className="card-description">{card.description || "Ready for household notes and care details."}</p>
                      <div className="next-action">
                        <span>Next</span>
                        <strong>{card.nextDueOn ? formatDate(card.nextDueOn) : stateLabels[card.state]}</strong>
                      </div>
                      <div className="plan-chips" aria-label={`${card.name} maintenance plans`}>
                        {activePlans.slice(0, 3).map((plan) => <span key={plan.id}>{plan.name}</span>)}
                        {activePlans.length > 3 && <span>+{activePlans.length - 3}</span>}
                      </div>
                      <button className="details-button" type="button" onClick={() => setExpandedCard(open ? null : card.id)} aria-expanded={open}>
                        {open ? "Hide details" : "View care details"}<span aria-hidden="true">{open ? "−" : "+"}</span>
                      </button>
                      {open && (
                        <div className="card-details">
                          {card.careNotes && <p>{card.careNotes}</p>}
                          <div className="detail-heading"><h4>Maintenance</h4><button type="button" onClick={() => setEditor({ kind: "plan", card })}>Add</button></div>
                          <ul>
                            {card.plans.map((plan) => (
                              <li className="editable-row" key={plan.id}>
                                <button type="button" onClick={() => setEditor({ kind: "plan", card, plan })}>{plan.name}{!plan.enabled && " (paused)"}</button>
                                <span><strong>{plan.dueOn ? formatDate(plan.dueOn) : stateLabels[plan.state]}</strong><button className="log-button" type="button" onClick={() => setEditor({ kind: "complete", card, plan })}>Log</button></span>
                              </li>
                            ))}
                          </ul>
                          <h4>Recent history</h4>
                          {card.recentRecords.length ? (
                            <ul>
                              {card.recentRecords.map((record) => <li key={record.id}><span>{record.planName}{record.photoUrls.length > 0 && <img className="history-photo" src={record.photoUrls[0]} alt="" />}</span><strong>{formatDate(record.completedOn)}</strong></li>)}
                            </ul>
                          ) : <p>No maintenance has been logged yet.</p>}
                          <button className="secondary-button full-button" type="button" onClick={() => setEditor({ kind: "card", card })}>Edit card</button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state"><strong>No cards match those filters.</strong><span>Try a different location, status, or search.</span></div>
          )}
        </section>

        <section className="activity-section" id="activity" aria-labelledby="activity-heading">
          <div className="section-heading">
            <div><p className="eyebrow">Shared household record</p><h2 id="activity-heading">Recent activity</h2></div>
          </div>
          <div className="activity-list">
            {dashboard.recentActivity.map((record) => (
              <div className="activity-row" key={record.id}>
                <span className="activity-dot" aria-hidden="true" />
                <div><strong>{record.planName}</strong><span>{record.cardName}{record.notes ? ` · ${record.notes}` : ""}</span></div>
                <time dateTime={record.completedOn}>{formatDate(record.completedOn)}</time>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer><span>Yard Tracker</span><span>Private on your household network</span></footer>
      {editor && <Editor state={editor} dashboard={dashboard} onClose={() => setEditor(null)} onSaved={refreshAll} />}
    </div>
  );
}

export default App;
