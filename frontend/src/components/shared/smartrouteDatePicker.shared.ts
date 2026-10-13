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

/** Kun rejimi: ko'zni charchatmaydigan yumshoq kulrang-moviy maydon va kalendar. */
export const smartrouteLightDayDatePickerTheme = createTheme({
    palette: {
        mode: 'light',
        primary: { main: '#4f46e5' },
        text: { primary: '#1e293b', secondary: '#475569' },
        background: { default: '#e3eaf4', paper: '#eef2f8' },
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
                    backgroundColor: '#e3eaf4',
                    '& fieldset': { borderColor: '#bdcada' },
                    '&:hover fieldset': { borderColor: '#94a3b8' },
                    '&.Mui-focused fieldset': { borderColor: '#4f46e5' },
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
                    backgroundColor: '#e3eaf4',
                },
                '& .MuiInputBase-input': {
                    color: '#1e293b',
                },
                '& .MuiInputLabel-root': {
                    color: '#475569',
                    fontSize: '0.8rem',
                },
                '& .MuiPickersInputBase-sectionsContainer': {
                    minWidth: Math.max(96, minWidth - 40),
                },
                '& .MuiPickersSectionList-sectionContent': {
                    color: '#1e293b',
                },
                '& .MuiSvgIcon-root': {
                    color: '#475569',
                },
            },
        },
        popper: {
            sx: {
                '& .MuiPaper-root': {
                    borderRadius: '16px',
                    backgroundImage: 'none',
                    backgroundColor: '#eef2f8',
                    border: '1px solid #c5d1e0',
                    boxShadow: '0 12px 36px rgba(15, 23, 42, 0.14)',
                },
                '& .MuiDateCalendar-root': {
                    width: 300,
                    maxHeight: 352,
                    backgroundColor: '#eef2f8',
                },
                '& .MuiPickersCalendarHeader-root': {
                    minHeight: 40,
                    marginTop: 0.5,
                    marginBottom: 0.5,
                    paddingInline: 1.25,
                    color: '#1e293b',
                },
                '& .MuiPickersCalendarHeader-label': {
                    fontSize: '1.02rem',
                    fontWeight: 600,
                    color: '#1e293b',
                },
                '& .MuiPickersArrowSwitcher-button': {
                    color: '#475569',
                },
                '& .MuiDayCalendar-weekDayLabel': {
                    width: 34,
                    height: 24,
                    fontSize: '0.82rem',
                    color: '#475569',
                },
                '& .MuiPickersDay-root': {
                    width: 32,
                    height: 32,
                    fontSize: '0.9rem',
                    margin: '0 2px',
                    color: '#1e293b',
                    '&:hover': {
                        backgroundColor: '#dbe4f0',
                    },
                },
                '& .MuiPickersDay-root.Mui-selected': {
                    color: '#ffffff',
                    backgroundColor: '#4f46e5 !important',
                },
                '& .MuiPickersDay-root.Mui-selected:hover': {
                    backgroundColor: '#4338ca !important',
                },
                '& .MuiPickersLayout-actionBar': {
                    padding: '4px 12px 10px',
                    backgroundColor: '#e6ecf5',
                },
                '& .MuiPickersLayout-actionBar .MuiButton-root': {
                    fontSize: '0.88rem',
                    minWidth: 'auto',
                    padding: '4px 8px',
                    color: '#4f46e5',
                },
            },
        },
    };
}
