import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { api } from "../api/client";
import { useAppDispatch } from "../store";
import { eventReceived, projectPatched } from "../store/projectsSlice";
import type { Project, WorkflowEvent } from "../types";

let socket: Socket | null = null;

function getSocket(): Socket | null {
  const token = localStorage.getItem("aiwf_token");
  if (!token) return null;
  if (!socket) socket = io(api.base, { auth: { token }, transports: ["websocket", "polling"] });
  return socket;
}

/** Subscribes to one project's live feed and folds updates into the store. */
export function useProjectSocket(projectId: string | undefined) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!projectId) return;
    const s = getSocket();
    if (!s) return;

    const onEvent = (event: WorkflowEvent) => dispatch(eventReceived(event));
    const onProject = (project: Project) => dispatch(projectPatched(project));

    s.emit("project:subscribe", projectId);
    s.on("workflow:event", onEvent);
    s.on("project:updated", onProject);

    return () => {
      s.emit("project:unsubscribe", projectId);
      s.off("workflow:event", onEvent);
      s.off("project:updated", onProject);
    };
  }, [projectId, dispatch]);
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
