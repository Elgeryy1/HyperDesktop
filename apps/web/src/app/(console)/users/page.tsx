"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError, apiRequest } from "../../../lib/api";
import { Users, Plus, ChevronDown, ChevronUp, Shield, UserPlus, Mail, Lock, User } from "lucide-react";

type UserItem = {
  id: string;
  email: string;
  name: string;
  status: string;
  role: string;
};

type MePayload = {
  id: string;
  role: string;
};

const roleColors: Record<string, string> = {
  ADMINISTRADOR: "border-rose-500/20 bg-rose-500/10 text-rose-400",
  PROFESOR: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
  ALUMNO: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
};

const statusColors: Record<string, string> = {
  ACTIVE: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  INACTIVE: "border-neutral-500/20 bg-neutral-500/10 text-neutral-400",
  SUSPENDED: "border-amber-500/20 bg-amber-500/10 text-amber-400"
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    roleName: "ALUMNO"
  });

  const loadUsers = async () => {
    try {
      const result = await apiRequest<UserItem[]>("/users");
      setUsers(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users");
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const me = await apiRequest<MePayload>("/auth/me");
        setMeRole(me.role);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load current user");
      }
      await loadUsers();
    })();
  }, []);

  const canManageUsers = meRole === "ADMINISTRADOR";

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setError(null);

    try {
      await apiRequest("/users", { method: "POST", body: form });
      setForm({ email: "", name: "", password: "", roleName: "ALUMNO" });
      setShowForm(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="page-header mb-0">
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">Manage user accounts and role assignments</p>
        </div>
        {canManageUsers && (
          <button className="btn-primary" onClick={() => setShowForm(!showForm)} type="button">
            {showForm ? <ChevronUp className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {showForm ? "Close" : "Create User"}
          </button>
        )}
      </div>

      {/* Create user form */}
      {showForm && canManageUsers && (
        <form className="card-static animate-fade-in space-y-4" onSubmit={createUser}>
          <h3 className="text-sm font-semibold text-neutral-300">New User Account</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="input-label flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Full Name
              </label>
              <input
                className="input"
                placeholder="John Doe"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div>
              <label className="input-label flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email
              </label>
              <input
                className="input"
                type="email"
                placeholder="john@hyperdesk.local"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </div>
            <div>
              <label className="input-label flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Password
              </label>
              <input
                className="input"
                type="password"
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="input-label flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Role
              </label>
              <select
                className="input"
                value={form.roleName}
                onChange={(event) => setForm((prev) => ({ ...prev, roleName: event.target.value }))}
              >
                <option value="ADMINISTRADOR">Administrador - Full access</option>
                <option value="PROFESOR">Profesor - Labs and templates</option>
                <option value="ALUMNO">Alumno - Limited quota</option>
              </select>
            </div>
          </div>

          <button className="btn-primary w-full justify-center" type="submit" disabled={isCreating}>
            {isCreating ? "Creating..." : "Create User"}
          </button>
        </form>
      )}

      {error && <div className="alert-error">{error}</div>}

      {/* Users table */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-bold text-indigo-400">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-neutral-200">{user.name}</span>
                  </div>
                </td>
                <td className="text-neutral-400">{user.email}</td>
                <td>
                  <span className={`badge border ${roleColors[user.role] ?? "border-neutral-500/20 bg-neutral-500/10 text-neutral-400"}`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <span className={`badge border ${statusColors[user.status] ?? "border-neutral-500/20 bg-neutral-500/10 text-neutral-400"}`}>
                    {user.status}
                  </span>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <Users className="h-7 w-7" />
                    </div>
                    <p className="empty-state-title">No users found</p>
                    <p className="empty-state-text">Create user accounts to manage access to the platform.</p>
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
