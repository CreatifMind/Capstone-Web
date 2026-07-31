"use client";

import { FormEvent, useEffect, useState } from "react";
import type { NotificationRow, SharedStats, TaskRow } from "./types";

type Props = { stats: SharedStats; onChanged: () => void };

const STATUS_COLORS: Record<TaskRow["status"], string> = {
  done: "var(--status-success, var(--success))",
  in_progress: "#c9743f",
  blocked: "var(--danger)",
  todo: "var(--text-secondary, var(--muted))"
};

export default function PmPanel({ stats, onChanged }: Props) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [title, setTitle] = useState("");
  const [assigneeRole, setAssigneeRole] = useState<TaskRow["assignee_role"]>("model_team");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const loadTasksAndNotifications = () => {
    setError("");
    fetch("/api/model-review/tasks")
      .then((response) => {
        if (!response.ok) {
          setError("Unable to load tasks.");
          return;
        }
        return response.json();
      })
      .then((data) => {
        if (data) setTasks(data.tasks || []);
      })
      .catch(() => setError("Unable to load tasks."));

    fetch("/api/model-review/notifications")
      .then((response) => {
        if (!response.ok) {
          setError("Unable to load notifications.");
          return;
        }
        return response.json();
      })
      .then((data) => {
        if (data) setNotifications(data.notifications || []);
      })
      .catch(() => setError("Unable to load notifications."));
  };

  useEffect(() => { loadTasksAndNotifications(); }, []);

  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setError("");
    try {
      const response = await fetch("/api/model-review/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, assigneeRole, url })
      });
      if (response.ok) {
        setTitle("");
        setUrl("");
        loadTasksAndNotifications();
      } else {
        setError("Unable to create task.");
      }
    } catch {
      setError("Unable to create task.");
    }
  };

  const updateTaskStatus = async (id: string, status: TaskRow["status"]) => {
    setError("");
    try {
      const response = await fetch("/api/model-review/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });
      if (response.ok) {
        loadTasksAndNotifications();
      } else {
        setError("Unable to update task status.");
      }
    } catch {
      setError("Unable to update task status.");
    }
  };

  const notify = async (team: "model" | "web") => {
    setError("");
    try {
      const response = await fetch("/api/model-review/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team })
      });
      if (response.ok) {
        loadTasksAndNotifications();
        onChanged();
      } else {
        setError("Unable to send notification.");
      }
    } catch {
      setError("Unable to send notification.");
    }
  };

  const taskCounts = tasks.reduce((counts, task) => ({ ...counts, [task.status]: (counts[task.status] || 0) + 1 }), {} as Record<string, number>);

  return (
    <>
      {error && <p className="mrc-error" role="alert">{error}</p>}

      <div className="mrc-card">
        <h2>Handoff status</h2>
        <div className="mrc-stepper">
          <div><span>1</span><small>Model testing<br />{stats.imagesTested} images</small></div>
          <div><span>2</span><small>Flagged for review<br />{stats.weeklyFalseSignals} items</small></div>
          <div><span>3</span><small>Retrain<br />{stats.currentRetrainRun?.status || "idle"}</small></div>
          <div><span>4</span><small>Live in production<br />{stats.liveVersion}</small></div>
        </div>
      </div>

      <section className="mrc-grid-2">
        <div className="mrc-card">
          <h2>Request status update</h2>
          <div className="mrc-controls">
            <button type="button" className="mrc-btn-secondary" onClick={() => notify("model")}>Email model team</button>
            <button type="button" className="mrc-btn-secondary" onClick={() => notify("web")}>Email web team</button>
          </div>
        </div>
        <div className="mrc-card">
          <h2>Notification log</h2>
          {!notifications.length && <p className="mrc-muted">No notifications sent yet.</p>}
          <ul className="mrc-notify-log">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <span>Notified {notification.team} team</span>
                <span className="mrc-muted">{new Date(notification.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mrc-card">
        <h2>Task log</h2>
        <p className="mrc-muted">Todo {taskCounts.todo || 0} &middot; In progress {taskCounts.in_progress || 0} &middot; Blocked {taskCounts.blocked || 0} &middot; Done {taskCounts.done || 0}</p>
        <form className="mrc-controls" onSubmit={createTask}>
          <input type="text" placeholder="Task title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <select value={assigneeRole} onChange={(event) => setAssigneeRole(event.target.value as TaskRow["assignee_role"])}>
            <option value="model_team">Model team</option>
            <option value="web_team">Web team</option>
            <option value="project_manager">Project manager</option>
          </select>
          <input type="text" placeholder="URL (optional)" value={url} onChange={(event) => setUrl(event.target.value)} />
          <button type="submit" className="mrc-btn-primary">Add task</button>
        </form>
        <table className="mrc-table">
          <thead>
            <tr><th>Task</th><th>Assignee</th><th>Status</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.url ? <a href={task.url} target="_blank" rel="noopener">{task.title}</a> : task.title}</td>
                <td className="mrc-muted">{task.assignee_role}</td>
                <td>
                  <select value={task.status} onChange={(event) => updateTaskStatus(task.id, event.target.value as TaskRow["status"])}
                    style={{ color: STATUS_COLORS[task.status] }}>
                    <option value="todo">Todo</option>
                    <option value="in_progress">In progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                </td>
                <td className="mrc-muted">{new Date(task.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
