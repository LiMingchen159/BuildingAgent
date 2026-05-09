"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProjects, Project, safeApiError, selectProject } from "../../lib/api";
import { clearSession, getSession, saveSelectedProject } from "../../lib/session";

export default function ProjectsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.token) {
      setLoading(false);
      setError("Login required. Sign in before selecting a project.");
      return;
    }
    setToken(session.token);
    getProjects(session.token)
      .then(setProjects)
      .catch((err) => setError(safeApiError(err)))
      .finally(() => setLoading(false));
  }, []);

  async function chooseProject(projectId: string) {
    if (!token) {
      setError("Login required. Sign in before selecting a project.");
      return;
    }
    setError(null);
    setSelecting(projectId);
    try {
      const selected = await selectProject(token, projectId);
      saveSelectedProject(selected);
      router.push(`/projects/${selected.id}/chat`);
    } catch (err) {
      setError(safeApiError(err));
    } finally {
      setSelecting(null);
    }
  }

  function logout() {
    clearSession();
    router.push("/");
  }

  return (
    <main id="main-content" className="shell">
      <div className="toolbar">
        <div>
          <p className="kicker">Project boundary check</p>
          <h1>Choose a project</h1>
        </div>
        <button type="button" className="secondary" onClick={logout}>Log out</button>
      </div>
      <section className="panel card" aria-live="polite">
        {loading ? <div className="status">Loading projects from the backend…</div> : null}
        {error ? <div className="alert" role="alert">{error}</div> : null}
        {!loading && !token ? <a href="/">Return to login</a> : null}
        {!loading && token && projects.length === 0 && !error ? <div className="status">No projects were returned for this account.</div> : null}
        <div className="project-grid" aria-label="Available projects">
          {projects.map((project) => (
            <button key={project.id} type="button" className="project-card" onClick={() => chooseProject(project.id)} disabled={selecting === project.id}>
              <span className="kicker">{project.id}</span>
              <h2>{project.name}</h2>
              <span>{selecting === project.id ? "Selecting…" : "Select project"}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
