// Dependency-free in-memory store. Swap for a real database later.
let sequence = 1;
const collections = new Map();

function collection(name) {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name);
}

export const store = {
  list(name) {
    return [...collection(name).values()];
  },
  get(name, id) {
    return collection(name).get(String(id)) ?? null;
  },
  create(name, data) {
    // A caller-supplied id (e.g. a session token) must be the lookup key, or get() never finds it.
    const id = data && data.id != null ? String(data.id) : String(sequence++);
    const record = { createdAt: new Date().toISOString(), ...data, id };
    collection(name).set(id, record);
    return record;
  },
  update(name, id, patch) {
    const existing = collection(name).get(String(id));
    if (!existing) return null;
    const updated = { ...existing, ...patch, id: existing.id };
    collection(name).set(String(id), updated);
    return updated;
  },
  remove(name, id) {
    return collection(name).delete(String(id));
  },
  reset() {
    collections.clear();
    sequence = 1;
  },
};
