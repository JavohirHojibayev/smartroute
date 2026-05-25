import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveApiBaseUrl } from '../../utils/apiBase';
import type { WaybillDraftPayload } from '../types';
import { getWaybillAuthToken } from './useWaybillAuthToken';

const API_BASE = resolveApiBaseUrl();

export const useWaybillDraft = () => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getWaybillAuthToken();
      const response = await fetch(`${API_BASE}/waybill-editor/drafts/yol-varaqasi`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('draft_load_failed');
      const payload = (await response.json()) as WaybillDraftPayload;
      setValues(payload.values ?? {});
    } catch {
      setError('Draft loading failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flushSave = useCallback(async (nextValues: Record<string, string>) => {
    setSaving(true);
    setError(null);
    try {
      const token = getWaybillAuthToken();
      const response = await fetch(`${API_BASE}/waybill-editor/drafts/yol-varaqasi`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ values: nextValues }),
      });
      if (!response.ok) throw new Error('draft_save_failed');
      const payload = (await response.json()) as WaybillDraftPayload;
      setValues(payload.values ?? {});
      dirtyRef.current = false;
    } catch {
      setError('Draft autosave failed.');
    } finally {
      setSaving(false);
    }
  }, []);

  const updateValue = useCallback((fieldKey: string, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [fieldKey]: value };
      dirtyRef.current = true;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        void flushSave(next);
      }, 1000);
      return next;
    });
  }, [flushSave]);

  const forceSave = useCallback(async () => {
    if (!dirtyRef.current) return;
    await flushSave(values);
  }, [flushSave, values]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  return { values, setValues, updateValue, load, loading, saving, error, forceSave };
};
