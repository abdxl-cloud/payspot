"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { readJsonResponse } from "@/lib/http";

const initialForm = {
  businessName: "",
  email: "",
  location: "",
  hotspotType: "",
  locationsCount: "1 location",
  notes: "",
};

export function TenantRequestForm() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return form.businessName.trim().length >= 2 && form.email.includes("@") && !loading;
  }, [form.businessName, form.email, loading]);

  function updateField(field: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setSuccessEmail(null);
    setLoading(true);

    try {
      const response = await fetch("/api/tenants/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.businessName.trim(),
          email: form.email.trim(),
          location: form.location.trim(),
          hotspotType: form.hotspotType,
          locationsCount: form.locationsCount,
          notes: form.notes.trim(),
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error || "Unable to submit request.");
      }
      setSuccessEmail(form.email.trim());
      setForm(initialForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (successEmail) {
    return (
      <div className="req-success req-success-live">
        <div className="req-success-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3>Request received!</h3>
        <p>
          We&apos;ll review your application and get back to you at <strong>{successEmail}</strong> within 24 hours.
        </p>
        <div className="req-success-actions">
          <Link className="btn btn-ac" href="/">Back to Home</Link>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setSuccessEmail(null)}>
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form id="req-form-wrap" onSubmit={handleSubmit}>
      <div className="req-form-title">Request access</div>
      <div className="req-form-sub">We&apos;ll review and respond within 24 hours</div>

      {error ? <div className="req-error">{error}</div> : null}

      <div className="field">
        <label htmlFor="requestBusiness">Business / Venue Name</label>
        <input id="requestBusiness" required value={form.businessName} onChange={(event) => updateField("businessName", event.target.value)} placeholder="WalStreet Cafe" />
      </div>
      <div className="field">
        <label htmlFor="requestEmail">Email Address</label>
        <input id="requestEmail" required type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="emeka@walstreet.ng" />
      </div>
      <div className="field">
        <label htmlFor="requestLocation">City / Location</label>
        <input id="requestLocation" value={form.location} onChange={(event) => updateField("location", event.target.value)} placeholder="Lagos, Nigeria" />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="requestHotspotType">Hotspot Type</label>
          <select id="requestHotspotType" value={form.hotspotType} onChange={(event) => updateField("hotspotType", event.target.value)}>
            <option value="">Select platform...</option>
            <option>Omada Cloud</option>
            <option>MikroTik RouterOS</option>
            <option>RADIUS / FreeRADIUS</option>
            <option>CSV voucher pool</option>
            <option>Not sure yet</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="requestLocations">Number of Locations</label>
          <select id="requestLocations" value={form.locationsCount} onChange={(event) => updateField("locationsCount", event.target.value)}>
            <option>1 location</option>
            <option>2-5 locations</option>
            <option>6-20 locations</option>
            <option>20+ locations</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="requestNotes">
          Tell us about your setup <span>(optional)</span>
        </label>
        <textarea
          id="requestNotes"
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="e.g. I run a cafe with 50 daily customers, currently using MikroTik..."
        />
      </div>

      <button className="req-submit" type="submit" disabled={!canSubmit}>
        {loading ? "Submitting..." : "Request Operator Access ->"}
      </button>
      <div className="req-footnote">We&apos;ll never spam you. No credit card required.</div>
    </form>
  );
}
