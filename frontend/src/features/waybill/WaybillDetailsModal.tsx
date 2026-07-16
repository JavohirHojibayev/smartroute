import { X, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { loadTransportRegistry } from '../../data/transportStore';

export type WaybillDetailsData = {
    driver: string;
    plate: string;
    type: string;
    cargo: string;
    route: string;
    departureTime: string;
    expectedReturn: string;
};

type WaybillDetailsModalProps = {
    open: boolean;
    onClose: () => void;
    data: WaybillDetailsData | null;
    onSave: (data: WaybillDetailsData) => void;
};

const translations = {
    headerTitle: { uz: "Yo'l varaqasini shakllantirish", ru: 'Формирование путевого листа', en: 'Waybill generation' },
    panelTitle: { uz: "Dispetcher: transport tayinlash", ru: 'Диспетчер: назначение транспорта', en: 'Dispatcher: transport assignment' },
    driver: { uz: 'Haydovchi', ru: 'Водитель', en: 'Driver' },
    transport: { uz: 'Transport', ru: 'Транспорт', en: 'Transport' },
    type: { uz: 'Transport turi', ru: 'Тип транспорта', en: 'Transport type' },
    goal: { uz: 'Maqsad / Ish', ru: 'Цель / Работа', en: 'Goal / Work' },
    direction: { uz: "Obyekt / Yo'nalish", ru: 'Объект / Направление', en: 'Object / Direction' },
    departureTime: { uz: 'Chiqish vaqti', ru: 'Время выхода', en: 'Departure time' },
    expectedReturn: { uz: 'Qaytish vaqti', ru: 'Время возвращения', en: 'Return time' },
    save: { uz: 'Saqlash', ru: 'Сохранить', en: 'Save' },
    cancel: { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancel' },
    transportPlaceholder: { uz: 'Transport raqami', ru: 'Номер транспорта', en: 'Transport number' }
};

export const WaybillDetailsModal = ({ open, onClose, data, onSave }: WaybillDetailsModalProps) => {
    const { lang } = useI18n();
    const t = (key: keyof typeof translations) => translations[key][lang as keyof typeof translations[keyof typeof translations]] || translations[key]['ru'];

    const [formData, setFormData] = useState({
        driver: '',
        plate: '',
        type: '',
        cargo: '',
        route: '',
        departureTime: '',
        expectedReturn: ''
    });

    const [allDrivers, setAllDrivers] = useState<string[]>([]);
    const [allPlates, setAllPlates] = useState<string[]>([]);
    const [plateToType, setPlateToType] = useState<Record<string, string>>({});

    useEffect(() => {
        if (open) {
            const clean = (val: string | undefined) => val === '-' ? '' : (val || '');
            setFormData({
                driver: clean(data?.driver),
                plate: clean(data?.plate),
                type: clean(data?.type),
                cargo: clean(data?.cargo),
                route: clean(data?.route),
                departureTime: clean(data?.departureTime),
                expectedReturn: clean(data?.expectedReturn)
            });

            const transports = loadTransportRegistry();
            const plates = transports.map(t => t.plate).filter(Boolean);
            const drivers = Array.from(new Set(transports.flatMap(t => t.drivers.map(d => d.fullName)))).filter(Boolean);
            
            const p2t: Record<string, string> = {};
            transports.forEach(t => {
                if (t.plate && t.vehicleType) {
                    p2t[t.plate] = t.vehicleType;
                }
            });

            setAllPlates(plates);
            setAllDrivers(drivers);
            setPlateToType(p2t);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const next = { ...prev, [name]: value };
            if (name === 'plate' && plateToType[value]) {
                next.type = plateToType[value];
            }
            return next;
        });
    };

    const handleSave = () => {
        onSave(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                type="button"
                onClick={onClose}
                className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
                aria-label="Yopish"
            />
            
            <div className="relative flex flex-col w-full max-w-xl max-h-[90vh] bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex shrink-0 items-center justify-between border-b border-slate-700/50 px-6 py-4 bg-slate-800/50">
                    <h3 className="text-lg font-semibold text-slate-100">
                        {t('headerTitle')}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="bg-white/5 border border-slate-700/50 rounded-xl p-5 shadow-lg">
                        <div className="space-y-4">
                            <datalist id="drivers-list">
                                {allDrivers.map((d, i) => <option key={i} value={d} />)}
                            </datalist>
                            <datalist id="plates-list">
                                {allPlates.map((p, i) => <option key={i} value={p} />)}
                            </datalist>

                            <InputRow label={t('driver')} name="driver" value={formData.driver} onChange={handleChange} list="drivers-list" />
                            <InputRow label={t('transport')} name="plate" value={formData.plate} onChange={handleChange} list="plates-list" placeholder={t('transportPlaceholder')} />
                            <InputRow label={t('type')} name="type" value={formData.type} onChange={handleChange} />
                            <InputRow label={t('goal')} name="cargo" value={formData.cargo} onChange={handleChange} />
                            <InputRow label={t('direction')} name="route" value={formData.route} onChange={handleChange} />
                            <InputRow label={t('departureTime')} name="departureTime" value={formData.departureTime} onChange={handleChange} type="datetime-local" />
                            <InputRow label={t('expectedReturn')} name="expectedReturn" value={formData.expectedReturn} onChange={handleChange} type="datetime-local" />
                        </div>
                    </div>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-700/50 px-6 py-4 bg-slate-800/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-500 transition-colors shadow-lg shadow-yellow-500/20"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                        <Save size={16} />
                        {t('save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

const InputRow = ({ label, name, value, onChange, type = "text", list, placeholder }: { label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; list?: string; placeholder?: string }) => (
    <div className="flex items-center gap-4">
        <div className="w-[40%] text-sm text-slate-400 font-medium leading-tight">{label}</div>
        <div className="w-[60%]">
            <input
                type={type}
                name={name}
                value={value}
                onChange={onChange}
                list={list}
                className="w-full bg-slate-950/50 border border-slate-700/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm text-slate-200 font-medium transition-all outline-none placeholder-slate-600"
                placeholder={placeholder || label}
            />
        </div>
    </div>
);
