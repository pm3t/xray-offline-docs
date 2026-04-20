// API-based database layer (replaces IndexedDB)
// All data is now persisted to SQLite via the backend server.

const API = '';  // Same-origin: relative URLs

export interface ScanHistoryItem {
    scanId: number;
    mawb: string;
    hawb: string;
    uldNo?: string;
    totalWeight?: number;
    topViewImage: string;
    sideViewImage: string;
    fotoBarang: string;
    qty: number;
    status: 'Finished XRay' | 'Pending XRay' | 'Release' | 'Reject';
    timestamp: string;
    submittedToCustoms?: boolean;
    submittedAt?: string;
}

export const scanDB = {
    async getAll(): Promise<ScanHistoryItem[]> {
        const res = await fetch(`${API}/api/scan-history`);
        if (!res.ok) throw new Error('Failed to fetch scan history');
        return res.json();
    },

    async add(item: Omit<ScanHistoryItem, 'scanId'>): Promise<number> {
        const res = await fetch(`${API}/api/scan-history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
        });
        if (!res.ok) throw new Error('Failed to add scan history');
        const data = await res.json();
        return data.scanId;
    },

    async update(item: ScanHistoryItem): Promise<void> {
        const res = await fetch(`${API}/api/scan-history/${item.scanId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
        });
        if (!res.ok) throw new Error('Failed to update scan history');
    },

    async delete(scanId: number): Promise<void> {
        const res = await fetch(`${API}/api/scan-history/${scanId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete scan history');
    },

    async bulkDelete(scanIds: number[]): Promise<void> {
        // Delete sequentially to avoid complex endpoint
        await Promise.all(scanIds.map(id => this.delete(id)));
    },
};

export const cargoAPI = {
    async getAll(): Promise<any[]> {
        const res = await fetch(`${API}/api/cargo`);
        if (!res.ok) throw new Error('Failed to fetch cargo');
        return res.json();
    },

    async save(cargo: any): Promise<void> {
        const res = await fetch(`${API}/api/cargo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cargo),
        });
        if (!res.ok) throw new Error('Failed to save cargo');
    },

    async saveBulk(list: any[]): Promise<void> {
        const res = await fetch(`${API}/api/cargo/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(list),
        });
        if (!res.ok) throw new Error('Failed to bulk save cargo');
    },

    async update(cargo: any): Promise<void> {
        const res = await fetch(`${API}/api/cargo/${cargo.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cargo),
        });
        if (!res.ok) throw new Error('Failed to update cargo');
    },

    async delete(id: string): Promise<void> {
        const res = await fetch(`${API}/api/cargo/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete cargo');
    },
};

export const settingsAPI = {
    async getAll(): Promise<Record<string, string>> {
        const res = await fetch(`${API}/api/settings`);
        if (!res.ok) return {};
        return res.json();
    },

    async save(settings: Record<string, string>): Promise<void> {
        await fetch(`${API}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        });
    },
};

/**
 * Upload a base64 data URL image to the server.
 * Returns the server-hosted URL path (e.g. /uploads/uuid.png)
 */
export async function uploadBase64Image(dataUrl: string, prefix: string): Promise<string> {
    if (!dataUrl) return '';
    const res = await fetch(`${API}/api/upload-image-base64`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, prefix }),
    });
    if (!res.ok) throw new Error('Failed to upload image');
    const data = await res.json();
    return data.url;
}

/**
 * Upload a File/Blob object to the server.
 * Returns the server-hosted URL path.
 */
export async function uploadFileImage(file: File, prefix: string): Promise<string> {
    const formData = new FormData();
    const ext = file.name.match(/\.[^.]+$/)?.[0] || '.jpg';
    const renamedFile = new File([file], `${prefix}-${Date.now()}${ext}`, { type: file.type });
    formData.append('image', renamedFile);
    const res = await fetch(`${API}/api/upload-image`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Failed to upload file');
    const data = await res.json();
    return data.url;
}
