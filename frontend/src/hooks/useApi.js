import { useState, useCallback } from 'react';
export const API = '/api/v1';
export function useApi() {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const reset = useCallback(() => {
        setData(null);
        setError('');
    }, []);
    const execute = useCallback(async (url, body, options) => {
        setLoading(true);
        setError('');
        setData(null);
        try {
            const opts = {
                method: options?.method || (body ? 'POST' : 'GET'),
                headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
            };
            if (body) {
                opts.body = typeof body === 'string' ? body : JSON.stringify(body);
            }
            const r = await fetch(url, opts);
            const text = await r.text();
            let result;
            try {
                result = JSON.parse(text);
            }
            catch {
                result = { raw: text };
            }
            if (!r.ok) {
                const msg = typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail || result);
                throw new Error(msg);
            }
            setData(result);
            setLoading(false);
            return result;
        }
        catch (e) {
            setError(e.message);
            setLoading(false);
            return null;
        }
    }, []);
    return { data, error, loading, execute, reset };
}
