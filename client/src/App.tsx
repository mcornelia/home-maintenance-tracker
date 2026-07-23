import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Editor } from "./Editor";
import {
  assetCategoryLabels,
  type AssetArea,
  type DashboardCard,
  type DashboardData,
  type DueState,
  type EditorState,
} from "./dashboard-types";
import { initials } from "./initials";

const stateLabels: Record<DueState, string> = {
  overdue: "Overdue",
  due: "Due today",
  due_soon: "Due soon",
  upcoming: "Upcoming",
  unscheduled: "Not scheduled",
  completed: "Completed",
  paused: "Paused",
};

const statePriority: Record<DueState, number> = {
  overdue: 0,
  due: 1,
  due_soon: 2,
  upcoming: 3,
  unscheduled: 4,
  completed: 5,
  paused: 6,
};

type View = "overview" | AssetArea | "activity";
type WeatherResult =
  | { status: "unconfigured" | "invalid_zip" | "unavailable" }
  | { status: "ready"; stale: boolean; locationName: string; days: Array<{ date: string; code: number; label: string; high: number; low: number; precipitationChance: number | null }> };

function viewFromHash(): View {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "grounds" || hash === "outdoors" || hash === "yard") return "grounds";
  if (hash === "household") return "household";
  if (hash === "activity") return "activity";
  return "overview";
}

function formatDate(value: string | null): string {
  if (!value) return "No date set";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
}

function linkedInstructions(value: string) {
  return value.split(/(https?:\/\/[^\s]+)/g).map((part, index) => (
    part.startsWith("http://") || part.startsWith("https://")
      ? <a href={part} target="_blank" rel="noreferrer" key={`${part}-${index}`}>{part}</a>
      : part
  ));
}

function weatherIcon(code: number): string {
  if (code === 0) return "☀";
  if (code <= 3) return "⛅";
  if (code === 45 || code === 48) return "〰";
  if (code <= 67 || (code >= 80 && code <= 82)) return "☂";
  if (code <= 86) return "❄";
  return "⚡";
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
        <div className="brand-mark">R</div>
        <p className="eyebrow">Private household access</p>
        <h1>{configured ? "Welcome home." : "Protect Ravenwood."}</h1>
        <p>{configured ? "Enter the shared household passphrase to open Ravenwood." : "Create one shared passphrase for your household. No email address or cloud account is required."}</p>
        <form onSubmit={submit}>
          <label><span>Household passphrase</span><input name="passphrase" type="password" minLength={6} maxLength={200} autoComplete={configured ? "current-password" : "new-password"} required autoFocus /></label>
          {!configured && <label><span>Confirm passphrase</span><input name="confirmation" type="password" minLength={6} maxLength={200} autoComplete="new-password" required /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={saving}>{saving ? "Opening…" : configured ? "Open Ravenwood" : "Create household login"}</button>
        </form>
      </section>
    </main>
  );
}

function WeatherPanel({ weather, zipCode }: { weather: WeatherResult | null; zipCode: string | null }) {
  return (
    <div className="weather-panel">
      {weather?.status === "ready" ? (
        <>
          <div className="forecast-heading"><div><p className="eyebrow">Outdoor outlook</p><strong>{weather.locationName}</strong></div><span>{weather.stale ? "Last available forecast" : "Five-day forecast"}</span></div>
          <div className="forecast-days">
            {weather.days.map((day) => (
              <div className="forecast-day" key={day.date}>
                <span>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(`${day.date}T12:00:00`))}</span>
                <b title={day.label}>{weatherIcon(day.code)}</b>
                <strong>{day.high}°</strong>
                <small>{day.low}° · {day.precipitationChance ?? 0}%</small>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="weather-empty">
          <span className="weather-icon" aria-hidden="true">☀</span>
          <div><strong>{weather?.status === "invalid_zip" ? "ZIP code not found" : weather?.status === "unavailable" ? "Forecast temporarily unavailable" : "Weather is ready to connect"}</strong><span>{zipCode ? `Forecast for ${zipCode}` : "Add a ZIP code in household settings"}</span></div>
        </div>
      )}
    </div>
  );
}

function AssetGrid({
  cards,
  locations,
  area,
  setEditor,
}: {
  cards: DashboardCard[];
  locations: DashboardData["locations"];
  area: AssetArea;
  setEditor: (value: EditorState | null) => void;
}) {
  const [location, setLocation] = useState("all");
  const [status, setStatus] = useState<"all" | DueState>("all");
  const [query, setQuery] = useState("");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const visibleCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return cards.filter((card) => {
      const matchesLocation = location === "all" || card.locationIds.includes(location);
      const matchesStatus = status === "all" || card.state === status;
      const searchable = `${card.name} ${card.description ?? ""} ${assetCategoryLabels[card.category]} ${card.locationNames.join(" ")} ${card.plans.map((plan) => plan.name).join(" ")}`.toLowerCase();
      return matchesLocation && matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [cards, location, query, status]);
  const areaLabel = area === "grounds" ? "Grounds & Exterior" : "Household";

  return (
    <section className="inventory-section" aria-labelledby="inventory-heading">
      <div className="section-heading">
        <div><p className="eyebrow">{area === "grounds" ? "Living landscape & exterior" : "Systems, appliances & safety"}</p><h1 id="inventory-heading">{areaLabel}</h1></div>
        <div className="section-actions"><span className="result-count">{visibleCards.length} of {cards.length} assets</span><button className="primary-button compact-button" type="button" onClick={() => setEditor({ kind: "card", defaultArea: area })}>Add asset</button></div>
      </div>
      <div className="controls" aria-label={`Filter ${areaLabel} assets`}>
        <label className="search-control"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={area === "grounds" ? "Plants, treatments, locations…" : "Systems, appliances, maintenance…"} /></label>
        <label><span>Location</span><select value={location} onChange={(event) => setLocation(event.target.value)}><option value="all">Everywhere</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as "all" | DueState)}><option value="all">All statuses</option><option value="overdue">Overdue</option><option value="due">Due today</option><option value="due_soon">Due soon</option><option value="upcoming">Upcoming</option><option value="unscheduled">Not scheduled</option><option value="paused">Paused</option></select></label>
      </div>
      {visibleCards.length ? (
        <div className="card-grid">
          {visibleCards.map((card, index) => {
            const open = expandedCard === card.id;
            const activePlans = card.plans.filter((plan) => plan.enabled);
            return (
              <article className={`asset-card state-${card.state}`} key={card.id}>
                <div className={`card-visual visual-${index % 6}`}>
                  {card.coverPhotoUrl ? <img src={card.coverPhotoUrl} alt="" /> : <span>{initials(card.name)}</span>}
                  <div className={`state-badge state-${card.state}`}>{stateLabels[card.state]}</div>
                </div>
                <div className="card-content">
                  <div className="location-line">{assetCategoryLabels[card.category]}{card.locationNames.length ? ` · ${card.locationNames.join(" · ")}` : ""}</div>
                  <h2>{card.name}</h2>
                  <p className="card-description">{card.description || "Ready for household notes and maintenance details."}</p>
                  <div className="next-action"><span>Next</span><strong>{card.nextDueOn ? formatDate(card.nextDueOn) : stateLabels[card.state]}</strong></div>
                  <div className="plan-chips" aria-label={`${card.name} maintenance plans`}>{activePlans.slice(0, 3).map((plan) => <span key={plan.id}>{plan.name}</span>)}{activePlans.length > 3 && <span>+{activePlans.length - 3}</span>}</div>
                  <button className="details-button" type="button" onClick={() => setExpandedCard(open ? null : card.id)} aria-expanded={open}>{open ? "Hide details" : "View maintenance"}<span aria-hidden="true">{open ? "−" : "+"}</span></button>
                  {open && (
                    <div className="card-details">
                      {card.careNotes && <p>{card.careNotes}</p>}
                      <div className="detail-heading"><h3>Maintenance</h3><button type="button" onClick={() => setEditor({ kind: "plan", card })}>Add</button></div>
                      <ul className="maintenance-list">{card.plans.map((plan) => <li className="editable-row maintenance-item" key={plan.id}><button type="button" onClick={() => setEditor({ kind: "plan", card, plan })}>{plan.name}{!plan.enabled && " (paused)"}</button><span><strong>{plan.dueOn ? formatDate(plan.dueOn) : stateLabels[plan.state]}</strong><button className="log-button" type="button" onClick={() => setEditor({ kind: "complete", card, plan })}>Log</button></span>{plan.instructions && <p className="maintenance-instructions">{linkedInstructions(plan.instructions)}</p>}</li>)}</ul>
                      <h3>Recent history</h3>
                      {card.recentRecords.length ? <ul>{card.recentRecords.map((record) => <li key={record.id}><span>{record.planName}{record.photoUrls.length > 0 && <img className="history-photo" src={record.photoUrls[0]} alt="" />}</span><strong>{formatDate(record.completedOn)}</strong></li>)}</ul> : <p>No maintenance has been logged yet.</p>}
                      <button className="secondary-button full-button" type="button" onClick={() => setEditor({ kind: "card", card })}>Edit asset</button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="empty-state"><strong>No assets match those filters.</strong><span>Try a different location, status, or search.</span></div>}
    </section>
  );
}

function App() {
  const [auth, setAuth] = useState<{ configured: boolean; authenticated: boolean } | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [view, setView] = useState<View>(viewFromHash);

  const loadDashboard = useCallback(async () => {
    const response = await fetch("/api/dashboard");
    if (response.status === 401 || response.status === 428) {
      setAuth((current) => ({ configured: response.status === 401 || current?.configured === true, authenticated: false }));
      setDashboard(null);
      return;
    }
    if (!response.ok) throw new Error("The Ravenwood dashboard could not be loaded.");
    setDashboard(await response.json() as DashboardData);
  }, []);
  const loadWeather = useCallback(async () => {
    const response = await fetch("/api/weather");
    if (response.ok) setWeather(await response.json() as WeatherResult);
  }, []);
  const refreshAll = useCallback(async () => { await loadDashboard(); await loadWeather(); }, [loadDashboard, loadWeather]);

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
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
        setError(requestError instanceof Error ? requestError.message : "Ravenwood could not be loaded.");
      });
    return () => controller.abort();
  }, [refreshAll]);
  useEffect(() => {
    document.title = dashboard?.household.displayName.trim() || "Ravenwood";
  }, [dashboard?.household.displayName]);

  if (error) return <main className="message-shell"><p className="eyebrow">Ravenwood</p><h1>We couldn’t open the house.</h1><p>{error} Check that the household server is running, then refresh this page.</p></main>;
  if (auth && !auth.authenticated) return <LoginScreen configured={auth.configured} onAuthenticated={() => { setAuth({ configured: true, authenticated: true }); void refreshAll(); }} />;
  if (!auth || !dashboard) return <main className="message-shell" aria-busy="true"><div className="loading-mark">R</div><p>Gathering today’s work…</p></main>;

  const householdName = dashboard.household.displayName;
  const groundsCards = dashboard.cards.filter((card) => card.area === "grounds");
  const householdCards = dashboard.cards.filter((card) => card.area === "household");
  const attentionItems = dashboard.cards
    .flatMap((card) => card.plans.map((plan) => ({ card, plan })))
    .filter(({ plan }) => plan.enabled && ["overdue", "due", "due_soon"].includes(plan.state))
    .sort((left, right) => statePriority[left.plan.state] - statePriority[right.plan.state] || (left.plan.dueOn ?? "9999").localeCompare(right.plan.dueOn ?? "9999"));
  const attentionCount = attentionItems.length;
  const areaAttention = (area: AssetArea) => attentionItems.filter((item) => item.card.area === area).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#overview" aria-label={`${householdName} overview`}><span className="brand-mark">{initials(householdName)}</span><span><strong>{householdName}</strong><small>Property care</small></span></a>
        <nav aria-label="Primary navigation">
          <a className={view === "overview" ? "active" : ""} href="#overview">Overview</a>
          <a className={view === "grounds" ? "active" : ""} href="#grounds">Grounds</a>
          <a className={view === "household" ? "active" : ""} href="#household">Household</a>
          <a className={view === "activity" ? "active" : ""} href="#activity">Activity</a>
          <button className="settings-button" type="button" onClick={() => setEditor({ kind: "settings" })}>Settings</button>
          <button className="settings-button lock-button" type="button" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); setAuth({ configured: true, authenticated: false }); setDashboard(null); }}>Lock</button>
        </nav>
      </header>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <a className={view === "overview" ? "active" : ""} href="#overview">Overview</a>
        <a className={view === "grounds" ? "active" : ""} href="#grounds">Grounds</a>
        <a className={view === "household" ? "active" : ""} href="#household">Household</a>
        <a className={view === "activity" ? "active" : ""} href="#activity">Activity</a>
      </nav>

      <main>
        {view === "overview" && (
          <>
            <section className="home-hero">
              <div className="hero-content"><p className="eyebrow">Athens, Georgia · {formatDate(dashboard.today)}</p><h1>{householdName}</h1><p>A home cared for with intention—inside, outside, and across every season.</p></div>
              <a className="hero-scroll" href="#today" aria-label="Jump to today’s maintenance">↓</a>
            </section>
            <section className="today-section" id="today">
              <div className="today-summary"><p className="eyebrow">{householdName} today</p><div className="today-number">{attentionCount}</div><h2>{attentionCount === 1 ? "item needs attention." : "items need attention."}</h2><p>{dashboard.counts.overdue} overdue · {dashboard.counts.due + dashboard.counts.due_soon} due or coming soon</p></div>
              <div className="attention-list">
                {attentionItems.length ? attentionItems.slice(0, 6).map(({ card, plan }) => <div className="attention-row" key={plan.id}><span className={`attention-state state-${plan.state}`}>{stateLabels[plan.state]}</span><div><strong>{plan.name}</strong><span>{card.name} · {card.area === "grounds" ? "Grounds & Exterior" : "Household"}</span></div><time>{plan.dueOn ? formatDate(plan.dueOn) : stateLabels[plan.state]}</time><button className="log-button" type="button" onClick={() => setEditor({ kind: "complete", card, plan })}>Log</button></div>) : <div className="caught-up"><strong>Everything is on schedule.</strong><span>{householdName} has nothing due soon.</span></div>}
                {attentionItems.length > 6 && <a className="text-link" href={attentionItems[6].card.area === "grounds" ? "#grounds" : "#household"}>View all {attentionItems.length} items →</a>}
              </div>
            </section>
            <section className="gateway-section" aria-label="Property areas">
              <a className="gateway gateway-grounds" href="#grounds"><p className="eyebrow">Outdoors</p><h2>Grounds<br />& Exterior</h2><p>Landscaping, structures, drainage, lighting, and the living systems around the house.</p><div><strong>{groundsCards.length}</strong><span>assets</span><strong>{areaAttention("grounds")}</strong><span>need attention</span></div><b>Explore grounds →</b></a>
              <a className="gateway gateway-household" href="#household"><p className="eyebrow">Inside</p><h2>Household<br />Maintenance</h2><p>Mechanical systems, appliances, water, safety equipment, and everything that keeps {householdName} running.</p><div><strong>{householdCards.length}</strong><span>assets</span><strong>{areaAttention("household")}</strong><span>need attention</span></div><b>Explore household →</b></a>
            </section>
            <section className="overview-activity">
              <div><p className="eyebrow">Shared household record</p><h2>Recently cared for.</h2><a className="text-link" href="#activity">View complete activity →</a></div>
              <div className="activity-list">{dashboard.recentActivity.slice(0, 5).map((record) => <div className="activity-row" key={record.id}><span className="activity-dot" aria-hidden="true" /><div><strong>{record.planName}</strong><span>{record.cardName}{record.notes ? ` · ${record.notes}` : ""}</span></div><time dateTime={record.completedOn}>{formatDate(record.completedOn)}</time></div>)}</div>
            </section>
          </>
        )}
        {view === "grounds" && <><div className="page-intro"><AssetGrid cards={groundsCards} locations={dashboard.locations} area="grounds" setEditor={setEditor} /></div><WeatherPanel weather={weather} zipCode={dashboard.household.zipCode} /></>}
        {view === "household" && <div className="page-intro"><AssetGrid cards={householdCards} locations={dashboard.locations} area="household" setEditor={setEditor} /></div>}
        {view === "activity" && <section className="activity-page"><div className="section-heading"><div><p className="eyebrow">Shared household record</p><h1>Activity</h1></div></div><div className="activity-list">{dashboard.recentActivity.map((record) => <div className="activity-row" key={record.id}><span className="activity-dot" aria-hidden="true" /><div><strong>{record.planName}</strong><span>{record.cardName}{record.notes ? ` · ${record.notes}` : ""}</span></div><time dateTime={record.completedOn}>{formatDate(record.completedOn)}</time></div>)}</div></section>}
      </main>
      <footer><span>{householdName}</span><span>Private on your household network</span></footer>
      {editor && <Editor state={editor} dashboard={dashboard} onClose={() => setEditor(null)} onSaved={refreshAll} />}
    </div>
  );
}

export default App;
