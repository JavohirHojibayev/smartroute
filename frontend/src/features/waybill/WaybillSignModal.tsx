import { useState, useEffect, useCallback } from 'react';
import { X, ShieldCheck, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { EimzoKeySelect } from '../../features/auth/EimzoKeySelect';
import { getEimzoKeys } from '../../features/auth/eimzo/eimzo.service';
import { SmartRouteCapiwsClient } from '../../features/auth/eimzo/capiws.client';
import type { EimzoKey } from '../../features/auth/eimzo/eimzo.types';
import { useI18n } from '../../i18n';

type WaybillSignModalProps = {
    open: boolean;
    driverName: string;
    onClose: () => void;
    onSigned: (signerFullName: string, signedAt: string) => void;
};

const getKeyOwnerFullName = (key: EimzoKey): string => {
    const cn = key.CN || key.alias || key.ownerName || key.name || '';
    return cn
        .replace(/[_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('uz-UZ')
        .replace(/(^|\s)(\S)/g, (match) => match.toLocaleUpperCase('uz-UZ'));
};

export const WaybillSignModal = ({ open, driverName, onClose, onSigned }: WaybillSignModalProps) => {
    const { lang } = useI18n();
    const [keys, setKeys] = useState<EimzoKey[]>([]);
    const [selectedKeyIndex, setSelectedKeyIndex] = useState(-1);
    const [loading, setLoading] = useState(false);
    const [signing, setSigning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const loadKeys = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const loadedKeys = await getEimzoKeys();
            setKeys(loadedKeys);
            if (loadedKeys.length > 0) {
                setSelectedKeyIndex(0);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'E-IMZO kalitlarni yuklashda xatolik');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            setSuccess(false);
            setError(null);
            setSigning(false);
            setSelectedKeyIndex(-1);
            setKeys([]);
            loadKeys();
        }
    }, [open, loadKeys]);

    const handleSign = async () => {
        if (selectedKeyIndex < 0 || !keys[selectedKeyIndex]) return;
        const key = keys[selectedKeyIndex];
        setSigning(true);
        setError(null);

        try {
            // Create a content string with waybill details for signing
            const signContent = JSON.stringify({
                type: 'waybill_approval',
                driver: driverName,
                timestamp: new Date().toISOString(),
                nonce: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
            });

            // Get module and sign content
            const module = new SmartRouteCapiwsClient();

            // Add configured API keys
            const hostKey = String(import.meta.env.VITE_EIMZO_API_KEY ?? '').trim();
            if (hostKey) {
                module.addKey(window.location.hostname, hostKey);
            }
            const rawPairs = String(import.meta.env.VITE_EIMZO_API_KEYS ?? '').trim();
            for (const pair of rawPairs.split(/[;,]+/g)) {
                if (!pair.trim()) continue;
                const separatorIndex = pair.search(/[:=]/);
                if (separatorIndex <= 0) continue;
                module.addKey(pair.slice(0, separatorIndex).trim(), pair.slice(separatorIndex + 1).trim());
            }

            await module.selectWorkingUrl();
            await module.checkVersion();
            await module.installApiKeys();

            const result = await module.signPkcs7(key, signContent);
            if (!result.pkcs7_64) {
                throw new Error('Imzo bekor qilindi');
            }

            const signerFullName = getKeyOwnerFullName(key);
            const signedAt = new Date().toISOString();

            setSuccess(true);

            // Short delay to show success state
            setTimeout(() => {
                onSigned(signerFullName, signedAt);
            }, 600);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const lower = msg.toLowerCase();
            if (lower.includes('timeout') || lower.includes('vaqti tugadi')) {
                setError('Parol kiritish vaqti tugadi');
            } else if (lower.includes('password') || lower.includes('парол') || lower.includes('pin')) {
                setError("Parol noto'g'ri");
            } else if (lower.includes('cancel') || lower.includes('отмен') || lower.includes('bekor')) {
                setError('Imzo bekor qilindi');
            } else if (lower.includes('expired') || lower.includes('muddati')) {
                setError('Kalit muddati tugagan');
            } else if (lower.includes('api key') || lower.includes('api-key') || lower.includes('domain')) {
                setError('E-IMZO API-key xatoligi. localhost orqali kiring yoki rasmiy API-key qo\'shing.');
            } else if (lower.includes('websocket') || lower.includes('e-imzo') || lower.includes('connection')) {
                setError('E-IMZO dasturi topilmadi. E-IMZO desktop ilovasini ishga tushiring.');
            } else {
                setError(msg || 'Imzolashda xatolik yuz berdi');
            }
        } finally {
            setSigning(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                type="button"
                onClick={onClose}
                className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
                aria-label="Yopish"
            />

            <div className="relative w-full max-w-md border border-slate-700/60 bg-slate-900 rounded-2xl shadow-2xl">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-slate-700/50 px-5 py-4 bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-emerald-500/10">
                            <ShieldCheck size={20} className="text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-100">
                                E-IMZO bilan tasdiqlash
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5 max-w-[240px] truncate">
                                {driverName}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-md hover:bg-slate-700/50 text-slate-300 transition-colors"
                        aria-label="Yopish"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-5">
                    {/* Loading state */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                            <Loader2 className="animate-spin text-blue-500" size={32} />
                            <p className="text-sm text-slate-400">E-IMZO kalitlar yuklanmoqda...</p>
                        </div>
                    )}

                    {/* Success state */}
                    {success && (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                            <div className="p-3 rounded-full bg-emerald-500/10">
                                <CheckCircle2 className="text-emerald-400" size={40} />
                            </div>
                            <p className="text-sm font-semibold text-emerald-400">Muvaffaqiyatli tasdiqlandi!</p>
                        </div>
                    )}

                    {/* Key selection */}
                    {!loading && !success && (
                        <>
                            <EimzoKeySelect
                                lang={lang}
                                keys={keys}
                                selectedIndex={selectedKeyIndex}
                                disabled={signing}
                                onChange={setSelectedKeyIndex}
                            />

                            {/* Error */}
                            {error && (
                                <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                                    <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                                    <p className="text-sm text-red-300">{error}</p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={signing}
                                    className="flex-1 h-11 rounded-xl border border-slate-700/70 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSign}
                                    disabled={selectedKeyIndex < 0 || signing || keys.length === 0}
                                    className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                                >
                                    {signing ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Imzolanmoqda...
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck size={16} />
                                            Tasdiqlash
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
