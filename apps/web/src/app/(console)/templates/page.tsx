"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest } from "../../../lib/api";
import { Layers, Plus, UserPlus, Trash2 } from "lucide-react";

type MePayload = {
  id: string;
  role: "ADMINISTRADOR" | "PROFESOR" | "ALUMNO";
};

type UserItem = {
  id: string;
  email: string;
  name: string;
  role: string;
};

type IsoItem = {
  id: string;
  name: string;
  version: string | null;
};

type TemplateItem = {
  id: string;
  name: string;
  version: string;
  sourceType: string;
  defaultVcpu: number;
  defaultMemoryMb: number;
  defaultDiskGb: number;
  createdById: string | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  iso: {
    id: string;
    name: string;
    version: string | null;
  } | null;
  assignments?: Array<{
    id: string;
    studentId: string;
    student: {
      id: string;
      name: string;
      email: string;
    };
  }>;
};

export default function TemplatesPage() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [students, setStudents] = useState<UserItem[]>([]);
  const [isos, setIsos] = useState<IsoItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [assigningTemplateId, setAssigningTemplateId] = useState<string | null>(null);
  const [selectedStudentByTemplate, setSelectedStudentByTemplate] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    version: "1.0",
    sourceType: "ISO" as "ISO" | "VM",
    isoId: "",
    defaultVcpu: 2,
    defaultMemoryMb: 4096,
    defaultDiskGb: 40
  });

  const canManageTemplates = me?.role === "ADMINISTRADOR" || me?.role === "PROFESOR";

  const loadData = async () => {
    const mePayload = await apiRequest<MePayload>("/auth/me");
    setMe(mePayload);

    const baseRequests = [
      apiRequest<TemplateItem[]>("/templates")
    ] as const;

    const templateList = await Promise.all(baseRequests).then((values) => values[0]);
    setTemplates(templateList);

    if (mePayload.role === "ADMINISTRADOR" || mePayload.role === "PROFESOR") {
      const [studentList, isoList] = await Promise.all([
        apiRequest<UserItem[]>("/users"),
        apiRequest<IsoItem[]>("/isos")
      ]);
      setStudents(studentList.filter((user) => user.role === "ALUMNO"));
      setIsos(isoList);
    }
  };

  useEffect(() => {
    void (async () => {
      setError(null);
      try {
        await loadData();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load templates");
      }
    })();
  }, []);

  const availableStudentsByTemplate = useMemo(() => {
    const map: Record<string, UserItem[]> = {};
    for (const template of templates) {
      const assigned = new Set((template.assignments ?? []).map((item) => item.studentId));
      map[template.id] = students.filter((student) => !assigned.has(student.id));
    }
    return map;
  }, [students, templates]);

  const createTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    setIsCreating(true);
    try {
      await apiRequest("/templates", {
        method: "POST",
        body: {
          name: form.name,
          version: form.version,
          sourceType: form.sourceType,
          isoId: form.isoId || undefined,
          defaultVcpu: form.defaultVcpu,
          defaultMemoryMb: form.defaultMemoryMb,
          defaultDiskGb: form.defaultDiskGb
        }
      });
      setFeedback("Template created.");
      setForm((prev) => ({
        ...prev,
        name: "",
        isoId: ""
      }));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create template");
    } finally {
      setIsCreating(false);
    }
  };

  const assignTemplate = async (templateId: string) => {
    const studentId = selectedStudentByTemplate[templateId];
    if (!studentId) return;

    setError(null);
    setFeedback(null);
    setAssigningTemplateId(templateId);
    try {
      await apiRequest(`/templates/${templateId}/assignments`, {
        method: "POST",
        body: { studentId }
      });
      setFeedback("Template assigned.");
      setSelectedStudentByTemplate((prev) => ({ ...prev, [templateId]: "" }));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to assign template");
    } finally {
      setAssigningTemplateId(null);
    }
  };

  const unassignTemplate = async (templateId: string, studentId: string) => {
    setError(null);
    setFeedback(null);
    try {
      await apiRequest(`/templates/${templateId}/assignments/${studentId}`, {
        method: "DELETE"
      });
      setFeedback("Template unassigned.");
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to unassign template");
    }
  };

  return (
    <section className="space-y-6 animate-fade-in">
      <div className="page-header mb-0">
        <h1 className="page-title">Templates</h1>
        <p className="page-subtitle">Professor-ready VM templates with per-student assignments</p>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {feedback && <div className="alert-success">{feedback}</div>}

      {canManageTemplates && (
        <form className="card-static space-y-4" onSubmit={createTemplate}>
          <h2 className="text-sm font-semibold text-neutral-300">Create Template</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="input-label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div>
              <label className="input-label">Version</label>
              <input
                className="input"
                value={form.version}
                onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))}
                required
              />
            </div>
            <div>
              <label className="input-label">ISO (optional)</label>
              <select
                className="input"
                value={form.isoId}
                onChange={(event) => setForm((prev) => ({ ...prev, isoId: event.target.value }))}
              >
                <option value="">No ISO</option>
                {isos.map((iso) => (
                  <option key={iso.id} value={iso.id}>
                    {iso.name} {iso.version ?? ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label">Default vCPU</label>
              <input
                className="input"
                type="number"
                min={1}
                max={64}
                value={form.defaultVcpu}
                onChange={(event) => setForm((prev) => ({ ...prev, defaultVcpu: Number(event.target.value) }))}
              />
            </div>
            <div>
              <label className="input-label">Default RAM (MB)</label>
              <input
                className="input"
                type="number"
                min={512}
                value={form.defaultMemoryMb}
                onChange={(event) => setForm((prev) => ({ ...prev, defaultMemoryMb: Number(event.target.value) }))}
              />
            </div>
            <div>
              <label className="input-label">Default Disk (GB)</label>
              <input
                className="input"
                type="number"
                min={5}
                value={form.defaultDiskGb}
                onChange={(event) => setForm((prev) => ({ ...prev, defaultDiskGb: Number(event.target.value) }))}
              />
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={isCreating}>
            <Plus className="h-4 w-4" />
            {isCreating ? "Creating..." : "Create Template"}
          </button>
        </form>
      )}

      <div className="grid gap-4">
        {templates.map((template) => (
          <article key={template.id} className="card-static space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-neutral-100">
                    {template.name} <span className="text-neutral-500">{template.version}</span>
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {template.defaultVcpu} vCPU · {Math.round((template.defaultMemoryMb / 1024) * 10) / 10} GB RAM · {template.defaultDiskGb} GB disk
                  </p>
                </div>
              </div>
              <span className="badge border border-white/10 bg-white/[0.04] text-neutral-300">{template.sourceType}</span>
            </div>

            <div className="text-xs text-neutral-500">
              Owner: {template.createdBy?.name ?? "System"} · ISO: {template.iso ? `${template.iso.name} ${template.iso.version ?? ""}` : "None"}
            </div>

            {canManageTemplates && (
              <div className="space-y-2 border-t border-white/[0.06] pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="input max-w-xs"
                    value={selectedStudentByTemplate[template.id] ?? ""}
                    onChange={(event) =>
                      setSelectedStudentByTemplate((prev) => ({
                        ...prev,
                        [template.id]: event.target.value
                      }))
                    }
                  >
                    <option value="">Assign to student...</option>
                    {(availableStudentsByTemplate[template.id] ?? []).map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} ({student.email})
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => void assignTemplate(template.id)}
                    disabled={!selectedStudentByTemplate[template.id] || assigningTemplateId === template.id}
                  >
                    <UserPlus className="h-4 w-4" />
                    Assign
                  </button>
                </div>
                {!!template.assignments?.length && (
                  <div className="space-y-1.5">
                    {template.assignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                      >
                        <p className="text-sm text-neutral-300">
                          {assignment.student.name} <span className="text-neutral-500">({assignment.student.email})</span>
                        </p>
                        <button
                          className="btn-icon text-red-400/70 hover:text-red-300 hover:bg-red-500/10"
                          type="button"
                          onClick={() => void unassignTemplate(template.id, assignment.studentId)}
                          title="Unassign"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </article>
        ))}

        {!templates.length && (
          <div className="empty-state card-static">
            <div className="empty-state-icon">
              <Layers className="h-7 w-7" />
            </div>
            <p className="empty-state-title">No templates available</p>
            <p className="empty-state-text">
              {canManageTemplates
                ? "Create your first template or create one from an existing VM."
                : "Your teacher has not assigned templates yet."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
