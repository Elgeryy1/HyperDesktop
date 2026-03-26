"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError, apiRequest } from "../../../lib/api";
import { Disc, Upload, Plus, ChevronDown, ChevronUp, File, Trash2 } from "lucide-react";

type Iso = {
  id: string;
  name: string;
  version: string | null;
  osFamily: string | null;
  path: string;
  storagePoolId: string;
  sizeBytes?: string;
  checksumSha256?: string;
};

type StoragePool = {
  id: string;
  name: string;
};

export default function IsosPage() {
  const [isos, setIsos] = useState<Iso[]>([]);
  const [pools, setPools] = useState<StoragePool[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    version: "",
    osFamily: "",
    storagePoolId: "",
    file: null as File | null
  });

  const loadData = async () => {
    try {
      const [isoList, poolList] = await Promise.all([apiRequest<Iso[]>("/isos"), apiRequest<StoragePool[]>("/storage")]);
      setIsos(isoList);
      setPools(poolList);
      setError(null);
      if (!form.storagePoolId && poolList[0]) {
        setForm((prev) => ({ ...prev, storagePoolId: poolList[0].id }));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load ISOs");
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!form.file) {
        setError("Select an ISO file first.");
        return;
      }

      const formData = new FormData();
      formData.append("iso", form.file);
      if (form.name.trim()) formData.append("name", form.name.trim());
      if (form.version.trim()) formData.append("version", form.version.trim());
      if (form.osFamily.trim()) formData.append("osFamily", form.osFamily.trim());
      if (form.storagePoolId) formData.append("storagePoolId", form.storagePoolId);

      await apiRequest("/isos/upload", { method: "POST", body: formData });
      setForm((prev) => ({ ...prev, name: "", version: "", osFamily: "", file: null }));
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload ISO");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatSize = (bytes?: string) => {
    if (!bytes) return "-";
    const mb = Number(bytes) / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
  };

  return (
    <section className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="page-header mb-0">
          <h1 className="page-title">ISO Library</h1>
          <p className="page-subtitle">Manage installation media for virtual machines</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)} type="button">
          {showForm ? <ChevronUp className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          {showForm ? "Close" : "Upload ISO"}
        </button>
      </div>

      {/* Upload form */}
      {showForm && (
        <form className="card-static animate-fade-in space-y-4" onSubmit={onSubmit}>
          <h3 className="text-sm font-semibold text-neutral-300">Upload ISO Image</h3>

          {/* File drop area */}
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/10 bg-white/[0.02] p-8 transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/5">
            <Upload className="h-8 w-8 text-neutral-500 mb-3" />
            <p className="text-sm text-neutral-300 font-medium">
              {form.file ? form.file.name : "Click to select ISO file"}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              {form.file
                ? `${formatSize(String(form.file.size))} selected`
                : "SHA256 checksum generated automatically"}
            </p>
            <input
              className="hidden"
              type="file"
              accept=".iso,application/octet-stream"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setForm((prev) => ({
                  ...prev,
                  file: selected,
                  name: prev.name || (selected ? selected.name.replace(/\.iso$/i, "") : "")
                }));
              }}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="input-label">Name (optional)</label>
              <input
                className="input"
                placeholder="Ubuntu Desktop"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <label className="input-label">Version (optional)</label>
              <input
                className="input"
                placeholder="22.04 LTS"
                value={form.version}
                onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))}
              />
            </div>
            <div>
              <label className="input-label">OS Family (optional)</label>
              <input
                className="input"
                placeholder="Linux, Windows..."
                value={form.osFamily}
                onChange={(event) => setForm((prev) => ({ ...prev, osFamily: event.target.value }))}
              />
            </div>
            <div>
              <label className="input-label">Storage Pool</label>
              <select
                className="input"
                value={form.storagePoolId}
                onChange={(event) => setForm((prev) => ({ ...prev, storagePoolId: event.target.value }))}
                required
              >
                <option value="">Select pool</option>
                {pools.map((pool) => (
                  <option key={pool.id} value={pool.id}>
                    {pool.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button className="btn-primary w-full justify-center" type="submit" disabled={isSubmitting || !form.file}>
            {isSubmitting ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload ISO
              </>
            )}
          </button>
        </form>
      )}

      {error && <div className="alert-error">{error}</div>}

      {/* ISO table */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Version</th>
              <th>OS Family</th>
              <th>Size</th>
              <th>Path</th>
            </tr>
          </thead>
          <tbody>
            {isos.map((iso) => (
              <tr key={iso.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <Disc className="h-4 w-4 text-neutral-500" />
                    <span className="font-medium text-neutral-200">{iso.name}</span>
                  </div>
                </td>
                <td className="text-neutral-400">{iso.version ?? "-"}</td>
                <td>
                  {iso.osFamily ? (
                    <span className="badge border border-white/10 bg-white/5 text-neutral-300">{iso.osFamily}</span>
                  ) : (
                    <span className="text-neutral-500">-</span>
                  )}
                </td>
                <td className="text-neutral-400">{formatSize(iso.sizeBytes)}</td>
                <td><code className="text-xs text-neutral-500">{iso.path}</code></td>
              </tr>
            ))}
            {!isos.length && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <Disc className="h-7 w-7" />
                    </div>
                    <p className="empty-state-title">No ISOs uploaded</p>
                    <p className="empty-state-text">Upload installation media to use when creating virtual machines.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
