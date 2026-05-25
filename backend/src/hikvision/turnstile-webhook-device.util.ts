import type { TurnstileDeviceMapEntry } from '../turnstile-daily-access-kpis.util';
import { isMineShahtaFromStoredDevices } from './hikvision-access-event-filter';

/**
 * Webhookda jurnalga yoziladigan turniket: oddiy oqimda jismoniy IP xaritasi ustuvor.
 * (HTTP Listening orqali kelgan `payloadIp` / `requestIp` — qaysi panel yuborganini ko‘rsatadi.)
 */
export function resolveWebhookJournalDevice(options: {
  isSyncRequest: boolean;
  ipMappedDevice: TurnstileDeviceMapEntry | null;
  payloadKnownDevice: TurnstileDeviceMapEntry | null;
  declaredDevice: TurnstileDeviceMapEntry | null;
}): TurnstileDeviceMapEntry | null {
  const { isSyncRequest, ipMappedDevice, payloadKnownDevice, declaredDevice } = options;
  if (isSyncRequest) {
    return payloadKnownDevice ?? ipMappedDevice ?? declaredDevice;
  }
  return ipMappedDevice ?? payloadKnownDevice ?? declaredDevice;
}

export function isMineShahtaDeviceEntry(device: TurnstileDeviceMapEntry | null | undefined): boolean {
  if (!device) return false;
  const key = String(device.key ?? '').trim().toLowerCase();
  if (key.startsWith('mine-shahta') || key === 'shaxta-kirish' || key === 'shaxta-chiqish') {
    return true;
  }
  return isMineShahtaFromStoredDevices(device.deviceId, device.deviceName);
}
