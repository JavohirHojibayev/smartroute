import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WaybillDetailsData } from '../features/waybill/WaybillDetailsModal';

interface WaybillState {
    savedDetails: Record<string, WaybillDetailsData>;
    setSavedDetails: (details: Record<string, WaybillDetailsData> | ((prev: Record<string, WaybillDetailsData>) => Record<string, WaybillDetailsData>)) => void;
}

export const useWaybillStore = create<WaybillState>()(
    persist(
        (set) => ({
            savedDetails: {},
            setSavedDetails: (details) => 
                set((state) => ({
                    savedDetails: typeof details === 'function' ? details(state.savedDetails) : details
                }))
        }),
        {
            name: 'smartroute-waybill-storage',
        }
    )
);
