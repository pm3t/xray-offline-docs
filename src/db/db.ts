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
    status: 'Release' | 'Reject';
    timestamp: string;
    submittedToCustoms?: boolean;
    submittedAt?: string;
}

class ScanDB {
    private dbName = 'XRayScanDB';
    private dbVersion = 1;
    private storeName = 'scanHistory';

    private openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'scanId', autoIncrement: true });
                }
            };
        });
    }

    async getAll(): Promise<ScanHistoryItem[]> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async add(item: Omit<ScanHistoryItem, 'scanId'>): Promise<number> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.add(item);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result as number);
        });
    }

    async update(item: ScanHistoryItem): Promise<void> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(item);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async delete(scanId: number): Promise<void> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(scanId);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async bulkDelete(scanIds: number[]): Promise<void> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);

            scanIds.forEach(id => store.delete(id));

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
}

export const scanDB = new ScanDB();
