export interface CityResult {
  id: number;
  name: string;
  matchedName: string;
  admin: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

/** Only created on a nonempty city query; the index stays off the render thread. */
export class CitySearch {
  private worker?: Worker;
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (cities: CityResult[]) => void;
      reject: (error: Error) => void;
    }
  >();

  search(query: string): Promise<CityResult[]> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./city-search.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (
        event: MessageEvent<{ id: number; cities?: CityResult[]; error?: string }>,
      ) => {
        const request = this.pending.get(event.data.id);
        if (!request) return;
        this.pending.delete(event.data.id);
        if (event.data.error) request.reject(new Error(event.data.error));
        else request.resolve(event.data.cities ?? []);
      };
      this.worker.onerror = () => this.dispose();
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker!.postMessage({ id, query });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = undefined;
    for (const request of this.pending.values())
      request.reject(new Error('City search unavailable'));
    this.pending.clear();
  }
}
