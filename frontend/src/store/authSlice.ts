import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api } from "../api/client";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
}

const initialState: AuthState = {
  user: JSON.parse(localStorage.getItem("aiwf_user") ?? "null"),
  status: "idle",
  error: null,
};

function persist(token: string, user: User) {
  localStorage.setItem("aiwf_token", token);
  localStorage.setItem("aiwf_user", JSON.stringify(user));
}

export const login = createAsyncThunk(
  "auth/login",
  async (body: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await api.post<{ token: string; user: User }>("/api/auth/login", body);
      persist(res.token, res.user);
      return res.user;
    } catch (e) {
      return rejectWithValue((e as Error).message);
    }
  }
);

export const signup = createAsyncThunk(
  "auth/signup",
  async (body: { name: string; email: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await api.post<{ token: string; user: User }>("/api/auth/signup", body);
      persist(res.token, res.user);
      return res.user;
    } catch (e) {
      return rejectWithValue((e as Error).message);
    }
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      localStorage.removeItem("aiwf_token");
      localStorage.removeItem("aiwf_user");
    },
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (s) => { s.status = "loading"; s.error = null; })
      .addCase(login.fulfilled, (s, a) => { s.status = "idle"; s.user = a.payload; })
      .addCase(login.rejected, (s, a) => { s.status = "failed"; s.error = a.payload as string; })
      .addCase(signup.pending, (s) => { s.status = "loading"; s.error = null; })
      .addCase(signup.fulfilled, (s, a) => { s.status = "idle"; s.user = a.payload; })
      .addCase(signup.rejected, (s, a) => { s.status = "failed"; s.error = a.payload as string; });
  },
});

export const { logout, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
