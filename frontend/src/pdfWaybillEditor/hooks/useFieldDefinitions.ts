import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveApiBaseUrl } from '../../utils/apiBase';
import type { WaybillFieldDefinition, WaybillPageCalibration, WaybillTemplatePayload } from '../types';
import { getWaybillAuthToken } from './useWaybillAuthToken';

const API_BASE = resolveApiBaseUrl();

export const useFieldDefinitions = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<WaybillFieldDefinition[]>([]);
  const [calibrations, setCalibrations] = useState<WaybillPageCalibration[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getWaybillAuthToken();
      const response = await fetch(`${API_BASE}/waybill-editor/templates/yol-varaqasi/fields`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('field_definitions_load_failed');
      const payload = (await response.json()) as WaybillTemplatePayload;
      setFields(Array.isArray(payload.fields) ? payload.fields : []);
      setCalibrations(Array.isArray(payload.calibrations) ? payload.calibrations : []);
    } catch {
      setError('Field definitions loading failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (nextFields: WaybillFieldDefinition[], nextCalibrations: WaybillPageCalibration[]) => {
    const token = getWaybillAuthToken();
    const response = await fetch(`${API_BASE}/waybill-editor/templates/yol-varaqasi/fields`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        fields: nextFields,
        calibrations: nextCalibrations,
      }),
    });
    if (!response.ok) {
      throw new Error('field_definitions_save_failed');
    }
    const payload = (await response.json()) as WaybillTemplatePayload;
    setFields(Array.isArray(payload.fields) ? payload.fields : []);
    setCalibrations(Array.isArray(payload.calibrations) ? payload.calibrations : []);
    return payload;
  }, []);

  const calibrationByPage = useMemo(() => {
    const map = new Map<number, WaybillPageCalibration>();
    calibrations.forEach((item) => map.set(item.pageNumber, item));
    return map;
  }, [calibrations]);

  return {
    loading,
    error,
    fields,
    setFields,
    calibrations,
    setCalibrations,
    calibrationByPage,
    load,
    save,
  };
};
