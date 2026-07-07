import { useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import type { DateView } from '@mui/x-date-pickers/models';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { enUS, ruRU } from '@mui/x-date-pickers/locales';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/en-gb';
import 'dayjs/locale/ru';
import 'dayjs/locale/uz-latn';
import { useI18n } from '../../i18n';
import {
    smartrouteDarkDatePickerTheme,
    smartrouteDatePickerSlotProps,
    smartrouteLightDayDatePickerTheme,
    smartrouteLightDayDatePickerSlotProps,
} from './smartrouteDatePicker.shared';

export type LocalizedDateInputProps = {
    label: string;
    /** `YYYY-MM-DD` yoki `variant="month"` bo‘lsa `YYYY-MM` */
    value: string;
    onChange: (value: string) => void;
    minDate?: string;
    maxDate?: string;
    minWidth?: number;
    /**
     * `day` — faqat kun panjarasi (oy/yil strelkalar va sarlavha orqali), MainTrack «kun» rejimi.
     * `full` — yil / oy / kun ko‘rinishlari.
     */
    viewsMode?: 'day' | 'full';
    /** `month` — grafik uchun oy+yil (`YYYY-MM`). */
    variant?: 'date' | 'month';
};

function toBoundaryDayjs(boundary: string | undefined, endOfMonth: boolean): Dayjs | undefined {
    if (!boundary) return undefined;
    if (/^\d{4}-\d{2}$/.test(boundary)) {
        const d = dayjs(`${boundary}-01`);
        if (!d.isValid()) return undefined;
        return endOfMonth ? d.endOf('month') : d.startOf('month');
    }
    const d = dayjs(boundary);
    return d.isValid() ? d : undefined;
}

export function LocalizedDateInput({
    label,
    value,
    onChange,
    minDate,
    maxDate,
    minWidth = 168,
    viewsMode = 'day',
    variant = 'date',
}: LocalizedDateInputProps) {
    const { lang, t } = useI18n();
    const isMonth = variant === 'month';
    const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>(() => {
        if (typeof document === 'undefined') return 'dark';
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    });

    const adapterLocale = lang === 'ru' ? 'ru' : lang === 'uz' ? 'uz-latn' : 'en-gb';

    const baseLocaleText =
        lang === 'ru'
            ? ruRU.components.MuiLocalizationProvider.defaultProps.localeText
            : enUS.components.MuiLocalizationProvider.defaultProps.localeText;

    const localeText = useMemo(
        () => ({
            ...baseLocaleText,
            fieldDayPlaceholder: () => t('datePlaceholderDay'),
            fieldMonthPlaceholder: () => t('datePlaceholderMonth'),
            fieldYearPlaceholder: () => t('datePlaceholderYear'),
            clearButtonLabel: t('datePickerClear'),
            todayButtonLabel: t('datePickerToday'),
            cancelButtonLabel: t('datePickerCancel'),
            okButtonLabel: t('datePickerConfirm'),
        }),
        [baseLocaleText, t],
    );

    const parsedValue = useMemo((): Dayjs | null => {
        if (!value) return null;
        if (isMonth) {
            if (!/^\d{4}-\d{2}$/.test(value)) return null;
            return dayjs(`${value}-01`);
        }
        const d = dayjs(value);
        return d.isValid() ? d : null;
    }, [value, isMonth]);

    const minD = isMonth ? toBoundaryDayjs(minDate, false) : minDate ? dayjs(minDate) : undefined;
    const maxD = isMonth ? toBoundaryDayjs(maxDate, true) : maxDate ? dayjs(maxDate) : undefined;

    const views: DateView[] = isMonth
        ? ['year', 'month']
        : viewsMode === 'day'
          ? ['day']
          : ['year', 'month', 'day'];
    const openTo: DateView = isMonth ? 'month' : 'day';
    const format = isMonth ? 'MM.YYYY' : 'DD.MM.YYYY';

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;

        const root = document.documentElement;
        const syncTheme = () => {
            setActiveTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
        };

        syncTheme();
        const observer = new MutationObserver(syncTheme);
        observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    const useLightDaySurface = !isMonth && viewsMode === 'day' && activeTheme === 'light';
    const pickerTheme = useLightDaySurface ? smartrouteLightDayDatePickerTheme : smartrouteDarkDatePickerTheme;
    const baseSlots = useLightDaySurface
        ? smartrouteLightDayDatePickerSlotProps(minWidth)
        : smartrouteDatePickerSlotProps(minWidth);
    const slotProps = {
        ...baseSlots,
        calendarHeader: isMonth ? { format: 'YYYY' } : baseSlots.calendarHeader,
    };

    return (
        <ThemeProvider theme={pickerTheme}>
            <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={adapterLocale} localeText={localeText}>
                <DatePicker
                    label={label}
                    format={format}
                    openTo={openTo}
                    views={views}
                    value={parsedValue}
                    minDate={minD}
                    maxDate={maxD}
                    onChange={(next: Dayjs | null) => {
                        if (!next || !next.isValid()) {
                            onChange('');
                            return;
                        }
                        onChange(isMonth ? next.format('YYYY-MM') : next.format('YYYY-MM-DD'));
                    }}
                    slotProps={slotProps}
                />
            </LocalizationProvider>
        </ThemeProvider>
    );
}
