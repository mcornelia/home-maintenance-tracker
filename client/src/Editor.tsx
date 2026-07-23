import { useState, type FormEvent } from "react";
import {
  assetCategoryLabels,
  type AssetArea,
  type AssetCategory,
  type DashboardData,
  type EditorState,
  type Schedule,
} from "./dashboard-types";

async function send(url: string, method: string, body: unknown): Promise<{ id?: string }> {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error ?? "That change could not be saved");
  }
  return response.status === 204 ? {} : await response.json() as { id?: string };
}

async function uploadPhoto(url: string, file: File): Promise<void> {
  const body = new FormData();
  body.append("photo", file);
  const response = await fetch(url, { method: "POST", body });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error ?? "The photo could not be saved");
  }
}

function value(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

export function Editor({ state, dashboard, onClose, onSaved }: {
  state: EditorState;
  dashboard: DashboardData;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleType, setScheduleType] = useState<"relative" | "fixed" | "one_time" | "none">(() => state.kind === "plan" ? state.plan?.schedule?.scheduleType ?? "relative" : "relative");
  const [digestCadence, setDigestCadence] = useState(dashboard.household.digestCadence);
  const [assetArea, setAssetArea] = useState<AssetArea>(() => state.kind === "card" ? state.card?.area ?? state.defaultArea ?? "grounds" : "grounds");
  const [assetCategory, setAssetCategory] = useState<AssetCategory>(() => state.kind === "card" ? state.card?.category ?? ((state.defaultArea ?? "grounds") === "grounds" ? "plants_landscaping" : "other") : "other");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      if (state.kind === "settings") {
        await send("/api/settings", "PUT", {
          displayName: value(form, "displayName"),
          zipCode: value(form, "zipCode") || null,
          dueSoonDays: Number(value(form, "dueSoonDays")),
          digestCadence,
          digestDay: digestCadence === "daily" ? 0 : Number(value(form, "digestDay")),
          digestLocalTime: value(form, "digestLocalTime"),
          notificationRecipients: value(form, "notificationRecipients").split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean),
          backupDestination: value(form, "backupDestination") || null,
          backupRetentionDays: Number(value(form, "backupRetentionDays")),
        });
        const hero = form.get("heroPhoto");
        if (hero instanceof File && hero.size > 0) await uploadPhoto("/api/settings/hero", hero);
      } else if (state.kind === "card") {
        const body = {
          name: value(form, "name"),
          area: assetArea,
          category: assetCategory,
          description: value(form, "description") || null,
          careNotes: value(form, "careNotes") || null,
          locationIds: form.getAll("locationIds").map(String),
          enabled: form.get("enabled") === "on",
        };
        const result = await send(state.card ? `/api/cards/${encodeURIComponent(state.card.id)}` : "/api/cards", state.card ? "PATCH" : "POST", body);
        const cardId = state.card?.id ?? result.id;
        const photo = form.get("photo");
        if (cardId && photo instanceof File && photo.size > 0) await uploadPhoto(`/api/cards/${encodeURIComponent(cardId)}/cover`, photo);
      } else if (state.kind === "plan") {
        let schedule: Schedule | null = null;
        if (scheduleType === "relative") {
          schedule = {
            scheduleType,
            intervalQuantity: Number(value(form, "intervalQuantity")),
            intervalUnit: value(form, "intervalUnit") as "days" | "weeks" | "months" | "years",
            firstDueOn: value(form, "firstDueOn") || null,
          };
        } else if (scheduleType === "fixed") {
          schedule = {
            scheduleType,
            fixedDates: value(form, "fixedDates").split(",").map((item) => item.trim()).filter(Boolean),
            firstDueOn: value(form, "firstDueOn") || null,
          };
        } else if (scheduleType === "one_time") {
          schedule = { scheduleType, oneTimeDueOn: value(form, "oneTimeDueOn") };
        }
        const body = {
          name: value(form, "name"),
          actionType: value(form, "actionType"),
          instructions: value(form, "instructions") || null,
          enabled: form.get("enabled") === "on",
          includeInDigest: form.get("includeInDigest") === "on",
          schedule,
        };
        await send(
          state.plan ? `/api/plans/${encodeURIComponent(state.plan.id)}` : `/api/cards/${encodeURIComponent(state.card.id)}/plans`,
          state.plan ? "PATCH" : "POST",
          body,
        );
      } else {
        const result = await send(`/api/plans/${encodeURIComponent(state.plan.id)}/complete`, "POST", {
          completedOn: value(form, "completedOn"),
          notes: value(form, "notes") || null,
          satisfiesDueOn: state.plan.schedule?.scheduleType === "fixed" ? state.plan.dueOn : null,
        });
        const photo = form.get("photo");
        if (result.id && photo instanceof File && photo.size > 0) await uploadPhoto(`/api/records/${encodeURIComponent(result.id)}/photos`, photo);
      }
      await onSaved();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "That change could not be saved");
    } finally {
      setSaving(false);
    }
  }

  const title = state.kind === "settings" ? "Household settings" : state.kind === "card" ? (state.card ? `Edit ${state.card.name}` : "Add an asset") : state.kind === "plan" ? (state.plan ? `Edit ${state.plan.name}` : `Add maintenance for ${state.card.name}`) : `Log ${state.plan.name}`;
  const relative = state.kind === "plan" && state.plan?.schedule?.scheduleType === "relative" ? state.plan.schedule : null;
  const fixed = state.kind === "plan" && state.plan?.schedule?.scheduleType === "fixed" ? state.plan.schedule : null;
  const oneTime = state.kind === "plan" && state.plan?.schedule?.scheduleType === "one_time" ? state.plan.schedule : null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div className="editor-heading"><div><p className="eyebrow">Ravenwood</p><h2 id="editor-title">{title}</h2></div><button type="button" onClick={onClose} aria-label="Close editor">×</button></div>
        <form onSubmit={submit}>
          {state.kind === "settings" && <>
            <label><span>Household name</span><input name="displayName" defaultValue={dashboard.household.displayName} required maxLength={100} /></label>
            <label><span>Ravenwood masthead photo</span><input name="heroPhoto" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/tiff" /></label>
            <p className="form-help">Stored privately with the household data and included in Ravenwood backups.</p>
            <div className="form-row"><label><span>ZIP code</span><input name="zipCode" defaultValue={dashboard.household.zipCode ?? ""} inputMode="numeric" pattern="[0-9]{5}" placeholder="30605" /></label><label><span>Due soon window</span><input name="dueSoonDays" type="number" min="0" max="90" defaultValue={dashboard.household.dueSoonDays} required /></label></div>
            <p className="form-help">ZIP is stored only in your household database and will be used for the display-only forecast.</p>
            <fieldset><legend>Email digest</legend>
              <label><span>Recipients (comma or line separated)</span><textarea name="notificationRecipients" rows={2} defaultValue={dashboard.notificationRecipients.join(", ")} placeholder="you@example.com, partner@example.com" /></label>
              <div className="form-row"><label><span>Frequency</span><select value={digestCadence} onChange={(event) => setDigestCadence(event.target.value as typeof digestCadence)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label><span>Send time</span><input name="digestLocalTime" type="time" defaultValue={dashboard.household.digestLocalTime} required /></label></div>
              {digestCadence === "weekly" && <label><span>Send on</span><select name="digestDay" defaultValue={dashboard.household.digestDay}><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></label>}
              {digestCadence === "monthly" && <label><span>Day of month</span><input name="digestDay" type="number" min="1" max="28" defaultValue={Math.max(1, dashboard.household.digestDay)} required /></label>}
              <p className="form-help">SMTP credentials are configured privately on the host. Current status: {dashboard.smtpConfigured ? "ready" : "not configured yet"}.</p>
            </fieldset>
            <fieldset><legend>Nightly backups</legend>
              <label><span>Synced backup folder</span><input name="backupDestination" defaultValue={dashboard.household.backupDestination ?? ""} placeholder="/absolute/path/to/Ravenwood Backups" /></label>
              <label><span>Retention days</span><input name="backupRetentionDays" type="number" min="1" max="365" defaultValue={dashboard.household.backupRetentionDays} required /></label>
              <p className="form-help">Use a folder inside iCloud Drive, Dropbox, Google Drive, or any mounted local destination. The folder must already exist.</p>
            </fieldset>
          </>}
          {state.kind === "card" && <>
            <label><span>Asset name</span><input name="name" defaultValue={state.card?.name ?? ""} required maxLength={100} autoFocus /></label>
            <div className="form-row">
              <label><span>Area</span><select name="area" value={assetArea} onChange={(event) => { const nextArea = event.target.value as AssetArea; setAssetArea(nextArea); if (!state.card) setAssetCategory(nextArea === "grounds" ? "plants_landscaping" : "other"); }}><option value="grounds">Grounds & Exterior</option><option value="household">Household</option></select></label>
              <label><span>Category</span><select name="category" value={assetCategory} onChange={(event) => setAssetCategory(event.target.value as AssetCategory)}>
                {Object.entries(assetCategoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select></label>
            </div>
            <label><span>What it covers</span><textarea name="description" defaultValue={state.card?.description ?? ""} rows={2} maxLength={500} /></label>
            <label><span>Care notes</span><textarea name="careNotes" defaultValue={state.card?.careNotes ?? ""} rows={4} maxLength={4000} /></label>
            <label><span>{state.card?.coverPhotoUrl ? "Replace cover photo" : "Cover photo (optional)"}</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/tiff" /></label>
            <fieldset><legend>Locations</legend><div className="checkbox-grid">{dashboard.locations.map((location) => <label className="check-label" key={location.id}><input type="checkbox" name="locationIds" value={location.id} defaultChecked={state.card?.locationIds.includes(location.id)} /><span>{location.name}</span></label>)}</div></fieldset>
            <label className="check-label"><input type="checkbox" name="enabled" defaultChecked={state.card?.enabled ?? true} /><span>Asset is active</span></label>
          </>}
          {state.kind === "plan" && <>
            <div className="form-row"><label><span>Maintenance name</span><input name="name" defaultValue={state.plan?.name ?? ""} required autoFocus /></label><label><span>Short type</span><input name="actionType" defaultValue={state.plan?.actionType ?? ""} required /></label></div>
            <label><span>Instructions</span><textarea name="instructions" defaultValue={state.plan?.instructions ?? ""} rows={3} /></label>
            <label><span>Schedule</span><select value={scheduleType} onChange={(event) => setScheduleType(event.target.value as typeof scheduleType)}><option value="relative">Repeat after completion</option><option value="fixed">Fixed seasonal dates</option><option value="one_time">One-time work</option><option value="none">No reminder</option></select></label>
            {scheduleType === "relative" && <div className="form-row"><label><span>Repeat every</span><input name="intervalQuantity" type="number" min="1" max="3650" defaultValue={relative?.intervalQuantity ?? 90} required /></label><label><span>Unit</span><select name="intervalUnit" defaultValue={relative?.intervalUnit ?? "days"}><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option></select></label></div>}
            {scheduleType === "fixed" && <label><span>Dates (MM-DD, comma separated)</span><input name="fixedDates" defaultValue={fixed?.fixedDates.join(", ") ?? "03-15, 09-15"} required /></label>}
            {(scheduleType === "relative" || scheduleType === "fixed") && <label><span>First due date (optional)</span><input name="firstDueOn" type="date" defaultValue={(relative ?? fixed)?.firstDueOn ?? ""} /></label>}
            {scheduleType === "one_time" && <label><span>Due date</span><input name="oneTimeDueOn" type="date" defaultValue={oneTime?.oneTimeDueOn ?? dashboard.today} required /></label>}
            <div className="checkbox-grid"><label className="check-label"><input type="checkbox" name="enabled" defaultChecked={state.plan?.enabled ?? true} /><span>Maintenance is active</span></label><label className="check-label"><input type="checkbox" name="includeInDigest" defaultChecked={state.plan?.includeInDigest ?? true} /><span>Include in email digest</span></label></div>
          </>}
          {state.kind === "complete" && <>
            <label><span>Completed on</span><input name="completedOn" type="date" defaultValue={dashboard.today} required autoFocus /></label>
            <label><span>Notes (optional)</span><textarea name="notes" rows={4} placeholder="What did you use? Anything to remember next time?" /></label>
            <label><span>Dated photo (optional)</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/tiff" /></label>
            {state.plan.dueOn && <p className="form-help">This completion will reset the next reminder from the date above.</p>}
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div>
        </form>
      </section>
    </div>
  );
}
