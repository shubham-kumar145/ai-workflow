import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api } from "../api/client";
import type { Project, WorkflowEvent } from "../types";

interface ProjectsState {
  list: Project[];
  current: Project | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
  actionError: string | null;
}

const initialState: ProjectsState = {
  list: [],
  current: null,
  status: "idle",
  error: null,
  actionError: null,
};

export const fetchProjects = createAsyncThunk("projects/list", async () => {
  const res = await api.get<{ projects: Project[] }>("/api/projects");
  return res.projects;
});

export const fetchProject = createAsyncThunk("projects/one", async (id: string) => {
  const res = await api.get<{ project: Project }>(`/api/projects/${id}`);
  return res.project;
});

export const createProject = createAsyncThunk(
  "projects/create",
  async (body: { title: string; requirements: string; budget: number; budgetCapUsd: number }, { rejectWithValue }) => {
    try {
      const res = await api.post<{ project: Project }>("/api/projects", body);
      return res.project;
    } catch (e) {
      return rejectWithValue((e as Error).message);
    }
  }
);

export const submitApproval = createAsyncThunk(
  "projects/approve",
  async (
    args: { projectId: string; stage: "PLAN" | "BUILD" | "PRODUCTION"; decision: "APPROVED" | "CHANGES_REQUESTED"; feedback?: string },
    { rejectWithValue, dispatch }
  ) => {
    try {
      await api.post(`/api/projects/${args.projectId}/approvals`, {
        stage: args.stage,
        decision: args.decision,
        feedback: args.feedback,
      });
      return await dispatch(fetchProject(args.projectId)).unwrap();
    } catch (e) {
      return rejectWithValue((e as Error).message);
    }
  }
);

export const unblockProject = createAsyncThunk(
  "projects/unblock",
  async (args: { projectId: string; note?: string }, { rejectWithValue, dispatch }) => {
    try {
      await api.post(`/api/admin/projects/${args.projectId}/unblock`, { note: args.note });
      return await dispatch(fetchProject(args.projectId)).unwrap();
    } catch (e) {
      return rejectWithValue((e as Error).message);
    }
  }
);

export const withdrawApproval = createAsyncThunk(
  "projects/withdrawApproval",
  async (projectId: string, { rejectWithValue, dispatch }) => {
    try {
      await api.post(`/api/projects/${projectId}/withdraw-approval`);
      return await dispatch(fetchProject(projectId)).unwrap();
    } catch (e) {
      return rejectWithValue((e as Error).message);
    }
  }
);

const projectsSlice = createSlice({
  name: "projects",
  initialState,
  reducers: {
    clearActionError(state) {
      state.actionError = null;
    },
    /** Live Socket.io feed: prepend without refetching the whole project. */
    eventReceived(state, action: { payload: WorkflowEvent }) {
      if (!state.current) return;
      const events = state.current.events ?? [];
      if (!events.some((e) => e.id === action.payload.id)) {
        state.current.events = [action.payload, ...events].slice(0, 200);
      }
    },
    projectPatched(state, action: { payload: Partial<Project> & { id: string } }) {
      if (state.current?.id === action.payload.id) {
        Object.assign(state.current, action.payload);
      }
      const row = state.list.find((p) => p.id === action.payload.id);
      if (row) Object.assign(row, action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (s) => { s.status = "loading"; })
      .addCase(fetchProjects.fulfilled, (s, a) => { s.status = "idle"; s.list = a.payload; })
      .addCase(fetchProjects.rejected, (s, a) => { s.status = "failed"; s.error = a.error.message ?? null; })
      .addCase(fetchProject.fulfilled, (s, a) => { s.current = a.payload; })
      .addCase(createProject.fulfilled, (s, a) => { s.list.unshift(a.payload); })
      .addCase(createProject.rejected, (s, a) => { s.actionError = a.payload as string; })
      .addCase(submitApproval.fulfilled, (s, a) => { s.current = a.payload; s.actionError = null; })
      .addCase(submitApproval.rejected, (s, a) => { s.actionError = a.payload as string; })
      .addCase(withdrawApproval.fulfilled, (s, a) => { s.current = a.payload; s.actionError = null; })
      .addCase(withdrawApproval.rejected, (s, a) => { s.actionError = a.payload as string; })
      .addCase(unblockProject.fulfilled, (s, a) => { s.current = a.payload; })
      .addCase(unblockProject.rejected, (s, a) => { s.actionError = a.payload as string; });
  },
});

export const { eventReceived, projectPatched, clearActionError } = projectsSlice.actions;
export default projectsSlice.reducer;
