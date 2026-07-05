export interface IndexItem {
  name: string;
  path: string;
}

export interface IndexResponse {
  workflows: IndexItem[];
  entities: IndexItem[];
}

export interface WorkflowApiPayload {
  name: string;
  path: string;
  content: string;
  layout: Record<string, unknown>;
}

export interface EntityApiPayload {
  name: string;
  path: string;
  contents: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

export const fetchIndex = (): Promise<IndexResponse> => getJson("/api/index");
export const fetchWorkflow = (name: string): Promise<WorkflowApiPayload> =>
  getJson(`/api/workflow/${encodeURIComponent(name)}`);
export const fetchEntity = (name: string): Promise<EntityApiPayload> =>
  getJson(`/api/entity/${encodeURIComponent(name)}`);
