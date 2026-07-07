import { createTheme } from '@mui/material/styles';
import type { PickersActionBarAction } from '@mui/x-date-pickers/PickersActionBar';

const DEFAULT_ACTIONS: PickersActionBarAction[] = ['clear', 'today'];

/** Barcha SmartRoute MUI sanachalar uchun yagona qorong‘i tema (ESMO jurnali uslubi). */
export const smartrouteDarkDatePickerTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#34d399' },
        text: { primary: '#e2e8f0', secondary: '#94a3b8' },
        background: { default: '#0f172a', paper: '#1e293b' },
        divider: 'rgba(148, 163, 184, 0.22)',
    },
    shape: { borderRadius: 12 },
    typography: {
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    },
    components: {
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(15, 23, 42, 0.5)',
                    outline: 'none',
                    '&:hover': { outline: 'none', boxShadow: 'none' },
                    '&.Mui-focused': { outline: 'none' },
                    '& fieldset, & .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(71, 85, 105, 0.65)',
                    },
                    '&:hover fieldset, &:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(100, 116, 139, 0.85)',
                    },
                    '&.Mui-focused fieldset, &.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#34d399',
                        borderWidth: '1px',
                    },
                    '&.Mui-focused:hover fieldset, &.Mui-focused:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#34d399',
                    },
                },
            },
        },
    },
});

export function smartrouteDatePickerSlotProps(minWidth: number) {
    return {
        actionBar: { actions: DEFAULT_ACTIONS },
        calendarHeader: { format: 'MMMM YYYY' },
        textField: {
            size: 'small' as const,
            InputLabelProps: { shrink: true },
            sx: {
                minWidth,
                '& .MuiOutlinedInput-root': {
                    borderRadius: '12px',
                    backgroundColor: 'rgba(15, 23, 42, 0.5)',
                    outline: 'none',
                    '&:hover': { outline: 'none', boxShadow: 'none' },
                    '&.Mui-focused': { outline: 'none' },
                    '& fieldset, & .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(71, 85, 105, 0.65)',
                    },
                    '&:hover fieldset, &:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(100, 116, 139, 0.85)',
                    },
                    '&.Mui-focused fieldset, &.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#34d399',
                        borderWidth: '1px',
                    },
                },
                '& .MuiInputBase-input': {
                    color: '#e2e8f0',
                },
                '& .MuiInputLabel-root': {
                    color: '#94a3b8',
                    fontSize: '0.8rem',
                },
                '& .MuiPickersInputBase-sectionsContainer': {
                    minWidth: Math.max(96, minWidth - 40),
                },
                '& .MuiPickersSectionList-sectionContent': {
                    color: '#cbd5e1',
                },
                '& .MuiSvgIcon-root': {
                    color: '#94a3b8',
                },
            },
        },
        popper: {
            sx: {
                '& .MuiPaper-root': {
                    borderRadius: '16px',
                    backgroundImage: 'none',
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(71, 85, 105, 0.55)',
                    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.45)',
                },
                '& .MuiDateCalendar-root': {
                    width: 300,
                    maxHeight: 352,
                },
                '& .MuiPickersCalendarHeader-root': {
                    minHeight: 40,
                    marginTop: 0.5,
                    marginBottom: 0.5,
                    paddingInline: 1.25,
                },
                '& .MuiPickersCalendarHeader-label': {
                    fontSize: '1.02rem',
                    fontWeight: 600,
                },
                '& .MuiDayCalendar-weekDayLabel': {
                    width: 34,
                    height: 24,
                    fontSize: '0.82rem',
                },
                '& .MuiPickersDay-root': {
                    width: 32,
                    height: 32,
                    fontSize: '0.9rem',
                    margin: '0 2px',
                    color: '#e2e8f0',
                },
                '& .MuiPickersDay-root.Mui-selected': {
                    color: '#0f172a',
                    backgroundColor: '#34d399 !important',
                },
                '& .MuiPickersDay-root.Mui-selected:hover': {
                    backgroundColor: '#6ee7b7 !important',
                },
                '& .MuiPickersLayout-actionBar': {
                    padding: '4px 12px 10px',
                },
                '& .MuiPickersLayout-actionBar .MuiButton-root': {
                    fontSize: '0.88rem',
                    minWidth: 'auto',
                    padding: '4px 8px',
                },
            },
        },
    };
}

/** Kun rejimi: oq maydon + oq kalenda (ESMO jurnal filtri uslubi). */
export const smartrouteLightDayDatePickerTheme = createTheme({
    palette: {
        mode: 'light',
        primary: { main: '#059669' },
        text: { primary: '#0f172a', secondary: '#64748b' },
        background: { default: '#ffffff', paper: '#ffffff' },
        divider: 'rgba(15, 23, 42, 0.12)',
    },
    shape: { borderRadius: 12 },
    typography: {
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    },
    components: {
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    backgroundColor: '#ffffff',
                    '& fieldset': { borderColor: 'rgba(15, 23, 42, 0.14)' },
                    '&:hover fieldset': { borderColor: 'rgba(15, 23, 42, 0.28)' },
                    '&.Mui-focused fieldset': { borderColor: '#059669' },
                },
            },
        },
    },
});

export function smartrouteLightDayDatePickerSlotProps(minWidth: number) {
    return {
        actionBar: { actions: DEFAULT_ACTIONS },
        calendarHeader: { format: 'MMMM YYYY' },
        textField: {
            size: 'small' as const,
            InputLabelProps: { shrink: true },
            sx: {
                minWidth,
                '& .MuiOutlinedInput-root': {
                    borderRadius: '12px',
                    backgroundColor: '#ffffff',
                },
                '& .MuiInputBase-input': {
                    color: '#0f172a',
                },
                '& .MuiInputLabel-root': {
                    color: '#64748b',
                    fontSize: '0.8rem',
                },
                '& .MuiPickersInputBase-sectionsContainer': {
                    minWidth: Math.max(96, minWidth - 40),
                },
                '& .MuiPickersSectionList-sectionContent': {
                    color: '#334155',
                },
                '& .MuiSvgIcon-root': {
                    color: '#64748b',
                },
            },
        },
        popper: {
            sx: {
                '& .MuiPaper-root': {
                    borderRadius: '16px',
                    backgroundImage: 'none',
                    backgroundColor: '#ffffff',
                    border: '1px solid rgba(15, 23, 42, 0.1)',
                    boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
                },
                '& .MuiDateCalendar-root': {
                    width: 300,
                    maxHeight: 352,
                    backgroundColor: '#ffffff',
                },
                '& .MuiPickersCalendarHeader-root': {
                    minHeight: 40,
                    marginTop: 0.5,
                    marginBottom: 0.5,
                    paddingInline: 1.25,
                    color: '#0f172a',
                },
                '& .MuiPickersCalendarHeader-label': {
                    fontSize: '1.02rem',
                    fontWeight: 600,
                    color: '#0f172a',
                },
                '& .MuiPickersArrowSwitcher-button': {
                    color: '#475569',
                },
                '& .MuiDayCalendar-weekDayLabel': {
                    width: 34,
                    height: 24,
                    fontSize: '0.82rem',
                    color: '#64748b',
                },
                '& .MuiPickersDay-root': {
                    width: 32,
                    height: 32,
                    fontSize: '0.9rem',
                    margin: '0 2px',
                    color: '#0f172a',
                },
                '& .MuiPickersDay-root.Mui-selected': {
                    color: '#ffffff',
                    backgroundColor: '#059669 !important',
                },
                '& .MuiPickersDay-root.Mui-selected:hover': {
                    backgroundColor: '#10b981 !important',
                },
                '& .MuiPickersLayout-actionBar': {
                    padding: '4px 12px 10px',
                    backgroundColor: '#ffffff',
                },
                '& .MuiPickersLayout-actionBar .MuiButton-root': {
                    fontSize: '0.88rem',
                    minWidth: 'auto',
                    padding: '4px 8px',
                    color: '#059669',
                },
            },
        },
    };
}
