import { X, Save, Pencil, FileSpreadsheet } from 'lucide-react';
import { useState, useEffect } from 'react';
import { loadTransportRegistry } from '../../data/transportStore';

export type WaybillDetailsData = {
    // Header & Transport Info
    stampInfo?: string;
    waybillNo?: string;
    waybillDate?: string;
    driver: string;
    tabNo?: string;
    driverClass?: string;
    vehicleModel?: string;
    plate: string;
    type: string;
    workRegime?: string;
    regimeCode?: string;
    columnNo?: string;
    trailerPlate?: string;
    semiTrailerPlate?: string;
    companions?: string;

    // Vehicle Work (Table 1-6)
    departureTime: string;
    expectedReturn: string;
    paidDistance?: string;
    odometerOut?: string;
    odometerIn?: string;
    actualDeparture?: string;
    actualReturn?: string;

    // Fuel Expense (Table 7-14)
    fuelType?: string;
    fuelCode?: string;
    fuelGiven?: string;
    fuelOut?: string;
    fuelIn?: string;
    fuelNormCoef?: string;
    specialEquipmentHours?: string;
    engineHours?: string;

    fuelType2?: string;
    fuelCode2?: string;
    fuelGiven2?: string;
    fuelOut2?: string;
    fuelIn2?: string;
    fuelNormCoef2?: string;
    specialEquipmentHours2?: string;
    engineHours2?: string;

    fuelerSignature?: string;
    mechanicOutSignature?: string;
    mechanicInSignature?: string;
    dispatcherSignature?: string;

    // Assignment (Table 15-22)
    customer?: string;
    arrivalTime?: string;
    pickupLoc?: string;
    route?: string;
    cargo?: string;
    tripsCount?: string;
    distance?: string;
    weight?: string;

    customer2?: string;
    arrivalTime2?: string;
    pickupLoc2?: string;
    route2?: string;
    cargo2?: string;
    tripsCount2?: string;
    distance2?: string;
    weight2?: string;

    customer3?: string;
    arrivalTime3?: string;
    pickupLoc3?: string;
    route3?: string;
    cargo3?: string;
    tripsCount3?: string;
    distance3?: string;
    weight3?: string;

    customer4?: string;
    arrivalTime4?: string;
    pickupLoc4?: string;
    route4?: string;
    cargo4?: string;
    tripsCount4?: string;
    distance4?: string;
    weight4?: string;

    customer5?: string;
    arrivalTime5?: string;
    pickupLoc5?: string;
    route5?: string;
    cargo5?: string;
    tripsCount5?: string;
    distance5?: string;
    weight5?: string;

    // Signatures & Page 2
    licenseCheck?: string;
    fuelToGive?: string;
    doctorSignature?: string;
    mechanicOutApproval?: string;
    driverOutSignature?: string;
    driverInSignature?: string;
    techOutStatus?: string;
    techInStatus?: string;
    specialNotes?: string;
    ttnNumbers?: string;
    delaysInfo?: string;

    // TOPSHIRIWNI BAJARILISHI IZCHILLIGI (Cols 24-25)
    ttnNo1?: string; ttnSig1?: string;
    ttnNo2?: string; ttnSig2?: string;
    ttnNo3?: string; ttnSig3?: string;
    ttnNo4?: string; ttnSig4?: string;
    ttnNo5?: string; ttnSig5?: string;
    ttnNo6?: string; ttnSig6?: string;
    ttnNo7?: string; ttnSig7?: string;
    ttnNo8?: string; ttnSig8?: string;

    // LINIYADA TURIB QOLISHLAR (Cols 26-30)
    delayName1?: string; delayCode1?: string; delayStart1?: string; delayEnd1?: string; delaySig1?: string;
    delayName2?: string; delayCode2?: string; delayStart2?: string; delayEnd2?: string; delaySig2?: string;
    delayName3?: string; delayCode3?: string; delayStart3?: string; delayEnd3?: string; delaySig3?: string;
    delayName4?: string; delayCode4?: string; delayStart4?: string; delayEnd4?: string; delaySig4?: string;

    // TAKSIROFKA
    taksirofkaNotes?: string;

    // TTX & Avtomobilning ish natijalari (Cols 31-47)
    ttxCount?: string; ttxCountInWords?: string;
    driverHandoverSig?: string; dispatcherReceiveSig?: string;

    autoResults31_45?: string;
    fuelNorm31?: string; fuelActual32?: string; hoursTotal33?: string; hoursMoving34?: string;
    delaysTotal35?: string; loadingTotal36?: string; loadingOverNorm37?: string; techBreakdown38?: string;
    tripsWithCargo39?: string; distanceTotal40?: string; distanceLoaded41?: string;
    cargoWeightTotal42?: string; cargoWeightTrailer43?: string; tkmTotal44?: string; tkmTrailer45?: string;
    salaryCode46?: string; salaryAmount47?: string;

    fuelNorm31_2?: string; fuelActual32_2?: string; hoursTotal33_2?: string; hoursMoving34_2?: string;
    delaysTotal35_2?: string; loadingTotal36_2?: string; loadingOverNorm37_2?: string; techBreakdown38_2?: string;
    tripsWithCargo39_2?: string; distanceTotal40_2?: string; distanceLoaded41_2?: string;
    cargoWeightTotal42_2?: string; cargoWeightTrailer43_2?: string; tkmTotal44_2?: string; tkmTrailer45_2?: string;
    salaryCode46_2?: string; salaryAmount47_2?: string;

    codeVehicleModel?: string; codeTrailer?: string; codeSemiTrailer?: string; autoDaysInWork?: string;

    // Meta & Persistence
    isSaved?: boolean;
    savedAt?: number;
    securityStatus?: 'pending' | 'allowed' | 'denied' | 'returned';
    denyReason?: string;
    dispatcherName?: string;
    updatedAt?: number;
};

type WaybillDetailsModalProps = {
    open: boolean;
    onClose: () => void;
    data: WaybillDetailsData | null;
    onSave: (data: WaybillDetailsData) => void;
};

export const WaybillDetailsModal = ({ open, onClose, data, onSave }: WaybillDetailsModalProps) => {
    const [isEditing, setIsEditing] = useState<boolean>(false);

    const [formData, setFormData] = useState<WaybillDetailsData>({
        stampInfo: '',
        waybillNo: '',
        waybillDate: '',
        driver: '',
        tabNo: '',
        driverClass: '',
        vehicleModel: '',
        plate: '',
        type: '',
        workRegime: '',
        regimeCode: '',
        columnNo: '',
        trailerPlate: '',
        semiTrailerPlate: '',
        companions: '',

        departureTime: '',
        expectedReturn: '',
        paidDistance: '',
        odometerOut: '',
        odometerIn: '',
        actualDeparture: '',
        actualReturn: '',

        fuelType: '',
        fuelCode: '',
        fuelGiven: '',
        fuelOut: '',
        fuelIn: '',
        fuelNormCoef: '',
        specialEquipmentHours: '',
        engineHours: '',

        fuelType2: '',
        fuelCode2: '',
        fuelGiven2: '',
        fuelOut2: '',
        fuelIn2: '',
        fuelNormCoef2: '',
        specialEquipmentHours2: '',
        engineHours2: '',

        fuelerSignature: '',
        mechanicOutSignature: '',
        mechanicInSignature: '',
        dispatcherSignature: '',

        customer: '',
        arrivalTime: '',
        pickupLoc: '',
        route: '',
        cargo: '',
        tripsCount: '',
        distance: '',
        weight: '',

        customer2: '',
        arrivalTime2: '',
        pickupLoc2: '',
        route2: '',
        cargo2: '',
        tripsCount2: '',
        distance2: '',
        weight2: '',

        customer3: '',
        arrivalTime3: '',
        pickupLoc3: '',
        route3: '',
        cargo3: '',
        tripsCount3: '',
        distance3: '',
        weight3: '',

        customer4: '',
        arrivalTime4: '',
        pickupLoc4: '',
        route4: '',
        cargo4: '',
        tripsCount4: '',
        distance4: '',
        weight4: '',

        customer5: '',
        arrivalTime5: '',
        pickupLoc5: '',
        route5: '',
        cargo5: '',
        tripsCount5: '',
        distance5: '',
        weight5: '',

        licenseCheck: '',
        fuelToGive: '',
        doctorSignature: '',
        mechanicOutApproval: '',
        driverOutSignature: '',
        driverInSignature: '',
        techOutStatus: 'Soz',
        techInStatus: 'Soz',
        specialNotes: '',
        ttnNumbers: '',
        delaysInfo: '',

        ttnNo1: '', ttnSig1: '',
        ttnNo2: '', ttnSig2: '',
        ttnNo3: '', ttnSig3: '',
        ttnNo4: '', ttnSig4: '',
        ttnNo5: '', ttnSig5: '',
        ttnNo6: '', ttnSig6: '',
        ttnNo7: '', ttnSig7: '',
        ttnNo8: '', ttnSig8: '',

        delayName1: '', delayCode1: '', delayStart1: '', delayEnd1: '', delaySig1: '',
        delayName2: '', delayCode2: '', delayStart2: '', delayEnd2: '', delaySig2: '',
        delayName3: '', delayCode3: '', delayStart3: '', delayEnd3: '', delaySig3: '',
        delayName4: '', delayCode4: '', delayStart4: '', delayEnd4: '', delaySig4: '',

        taksirofkaNotes: '',

        ttxCount: '', ttxCountInWords: '', driverHandoverSig: '', dispatcherReceiveSig: '',
        autoResults31_45: '',
        fuelNorm31: '', fuelActual32: '', hoursTotal33: '', hoursMoving34: '',
        delaysTotal35: '', loadingTotal36: '', loadingOverNorm37: '', techBreakdown38: '',
        tripsWithCargo39: '', distanceTotal40: '', distanceLoaded41: '',
        cargoWeightTotal42: '', cargoWeightTrailer43: '', tkmTotal44: '', tkmTrailer45: '',
        salaryCode46: '', salaryAmount47: '',

        fuelNorm31_2: '', fuelActual32_2: '', hoursTotal33_2: '', hoursMoving34_2: '',
        delaysTotal35_2: '', loadingTotal36_2: '', loadingOverNorm37_2: '', techBreakdown38_2: '',
        tripsWithCargo39_2: '', distanceTotal40_2: '', distanceLoaded41_2: '',
        cargoWeightTotal42_2: '', cargoWeightTrailer43_2: '', tkmTotal44_2: '', tkmTrailer45_2: '',
        salaryCode46_2: '', salaryAmount47_2: '',

        codeVehicleModel: '', codeTrailer: '', codeSemiTrailer: '', autoDaysInWork: ''
    });

    const [allDrivers, setAllDrivers] = useState<string[]>([]);
    const [allPlates, setAllPlates] = useState<string[]>([]);
    const [plateToType, setPlateToType] = useState<Record<string, string>>({});

    useEffect(() => {
        if (open) {
            const hasSavedData = Boolean(
                data?.isSaved ||
                data?.savedAt ||
                (data && (data.departureTime || data.customer || data.fuelGiven || data.odometerOut || data.licenseCheck || data.waybillNo))
            );
            setIsEditing(!hasSavedData);

            const clean = (val: string | undefined) => val === '-' ? '' : (val || '');
            setFormData({
                stampInfo: clean(data?.stampInfo),
                waybillNo: clean(data?.waybillNo),
                waybillDate: clean(data?.waybillDate) || new Date().toISOString().split('T')[0],
                driver: clean(data?.driver),
                tabNo: clean(data?.tabNo),
                driverClass: clean(data?.driverClass),
                vehicleModel: clean(data?.vehicleModel),
                plate: clean(data?.plate),
                type: clean(data?.type),
                workRegime: clean(data?.workRegime),
                regimeCode: clean(data?.regimeCode),
                columnNo: clean(data?.columnNo),
                trailerPlate: clean(data?.trailerPlate),
                semiTrailerPlate: clean(data?.semiTrailerPlate),
                companions: clean(data?.companions),

                departureTime: clean(data?.departureTime),
                expectedReturn: clean(data?.expectedReturn),
                paidDistance: clean(data?.paidDistance),
                odometerOut: clean(data?.odometerOut),
                odometerIn: clean(data?.odometerIn),
                actualDeparture: clean(data?.actualDeparture),
                actualReturn: clean(data?.actualReturn),

                fuelType: clean(data?.fuelType),
                fuelCode: clean(data?.fuelCode),
                fuelGiven: clean(data?.fuelGiven),
                fuelOut: clean(data?.fuelOut),
                fuelIn: clean(data?.fuelIn),
                fuelNormCoef: clean(data?.fuelNormCoef),
                specialEquipmentHours: clean(data?.specialEquipmentHours),
                engineHours: clean(data?.engineHours),

                fuelType2: clean(data?.fuelType2),
                fuelCode2: clean(data?.fuelCode2),
                fuelGiven2: clean(data?.fuelGiven2),
                fuelOut2: clean(data?.fuelOut2),
                fuelIn2: clean(data?.fuelIn2),
                fuelNormCoef2: clean(data?.fuelNormCoef2),
                specialEquipmentHours2: clean(data?.specialEquipmentHours2),
                engineHours2: clean(data?.engineHours2),

                fuelerSignature: clean(data?.fuelerSignature),
                mechanicOutSignature: clean(data?.mechanicOutSignature),
                mechanicInSignature: clean(data?.mechanicInSignature),
                dispatcherSignature: clean(data?.dispatcherSignature),

                customer: clean(data?.customer),
                arrivalTime: clean(data?.arrivalTime),
                pickupLoc: clean(data?.pickupLoc),
                route: clean(data?.route),
                cargo: clean(data?.cargo),
                tripsCount: clean(data?.tripsCount),
                distance: clean(data?.distance),
                weight: clean(data?.weight),

                customer2: clean(data?.customer2),
                arrivalTime2: clean(data?.arrivalTime2),
                pickupLoc2: clean(data?.pickupLoc2),
                route2: clean(data?.route2),
                cargo2: clean(data?.cargo2),
                tripsCount2: clean(data?.tripsCount2),
                distance2: clean(data?.distance2),
                weight2: clean(data?.weight2),

                customer3: clean(data?.customer3),
                arrivalTime3: clean(data?.arrivalTime3),
                pickupLoc3: clean(data?.pickupLoc3),
                route3: clean(data?.route3),
                cargo3: clean(data?.cargo3),
                tripsCount3: clean(data?.tripsCount3),
                distance3: clean(data?.distance3),
                weight3: clean(data?.weight3),

                customer4: clean(data?.customer4),
                arrivalTime4: clean(data?.arrivalTime4),
                pickupLoc4: clean(data?.pickupLoc4),
                route4: clean(data?.route4),
                cargo4: clean(data?.cargo4),
                tripsCount4: clean(data?.tripsCount4),
                distance4: clean(data?.distance4),
                weight4: clean(data?.weight4),

                customer5: clean(data?.customer5),
                arrivalTime5: clean(data?.arrivalTime5),
                pickupLoc5: clean(data?.pickupLoc5),
                route5: clean(data?.route5),
                cargo5: clean(data?.cargo5),
                tripsCount5: clean(data?.tripsCount5),
                distance5: clean(data?.distance5),
                weight5: clean(data?.weight5),

                licenseCheck: clean(data?.licenseCheck),
                fuelToGive: clean(data?.fuelToGive),
                doctorSignature: clean(data?.doctorSignature),
                mechanicOutApproval: clean(data?.mechanicOutApproval),
                driverOutSignature: clean(data?.driverOutSignature),
                driverInSignature: clean(data?.driverInSignature),
                techOutStatus: clean(data?.techOutStatus) || 'Soz',
                techInStatus: clean(data?.techInStatus) || 'Soz',
                specialNotes: clean(data?.specialNotes),
                ttnNumbers: clean(data?.ttnNumbers),
                delaysInfo: clean(data?.delaysInfo),

                ttnNo1: clean(data?.ttnNo1), ttnSig1: clean(data?.ttnSig1),
                ttnNo2: clean(data?.ttnNo2), ttnSig2: clean(data?.ttnSig2),
                ttnNo3: clean(data?.ttnNo3), ttnSig3: clean(data?.ttnSig3),
                ttnNo4: clean(data?.ttnNo4), ttnSig4: clean(data?.ttnSig4),
                ttnNo5: clean(data?.ttnNo5), ttnSig5: clean(data?.ttnSig5),
                ttnNo6: clean(data?.ttnNo6), ttnSig6: clean(data?.ttnSig6),
                ttnNo7: clean(data?.ttnNo7), ttnSig7: clean(data?.ttnSig7),
                ttnNo8: clean(data?.ttnNo8), ttnSig8: clean(data?.ttnSig8),

                delayName1: clean(data?.delayName1), delayCode1: clean(data?.delayCode1), delayStart1: clean(data?.delayStart1), delayEnd1: clean(data?.delayEnd1), delaySig1: clean(data?.delaySig1),
                delayName2: clean(data?.delayName2), delayCode2: clean(data?.delayCode2), delayStart2: clean(data?.delayStart2), delayEnd2: clean(data?.delayEnd2), delaySig2: clean(data?.delaySig2),
                delayName3: clean(data?.delayName3), delayCode3: clean(data?.delayCode3), delayStart3: clean(data?.delayStart3), delayEnd3: clean(data?.delayEnd3), delaySig3: clean(data?.delaySig3),
                delayName4: clean(data?.delayName4), delayCode4: clean(data?.delayCode4), delayStart4: clean(data?.delayStart4), delayEnd4: clean(data?.delayEnd4), delaySig4: clean(data?.delaySig4),

                taksirofkaNotes: clean(data?.taksirofkaNotes),

                ttxCount: clean(data?.ttxCount), ttxCountInWords: clean(data?.ttxCountInWords),
                driverHandoverSig: clean(data?.driverHandoverSig), dispatcherReceiveSig: clean(data?.dispatcherReceiveSig),
                autoResults31_45: clean(data?.autoResults31_45),
                fuelNorm31: clean(data?.fuelNorm31), fuelActual32: clean(data?.fuelActual32),
                hoursTotal33: clean(data?.hoursTotal33), hoursMoving34: clean(data?.hoursMoving34),
                delaysTotal35: clean(data?.delaysTotal35), loadingTotal36: clean(data?.loadingTotal36),
                loadingOverNorm37: clean(data?.loadingOverNorm37), techBreakdown38: clean(data?.techBreakdown38),
                tripsWithCargo39: clean(data?.tripsWithCargo39), distanceTotal40: clean(data?.distanceTotal40),
                distanceLoaded41: clean(data?.distanceLoaded41), cargoWeightTotal42: clean(data?.cargoWeightTotal42),
                cargoWeightTrailer43: clean(data?.cargoWeightTrailer43), tkmTotal44: clean(data?.tkmTotal44),
                tkmTrailer45: clean(data?.tkmTrailer45), salaryCode46: clean(data?.salaryCode46),
                salaryAmount47: clean(data?.salaryAmount47),

                fuelNorm31_2: clean(data?.fuelNorm31_2), fuelActual32_2: clean(data?.fuelActual32_2),
                hoursTotal33_2: clean(data?.hoursTotal33_2), hoursMoving34_2: clean(data?.hoursMoving34_2),
                delaysTotal35_2: clean(data?.delaysTotal35_2), loadingTotal36_2: clean(data?.loadingTotal36_2),
                loadingOverNorm37_2: clean(data?.loadingOverNorm37_2), techBreakdown38_2: clean(data?.techBreakdown38_2),
                tripsWithCargo39_2: clean(data?.tripsWithCargo39_2), distanceTotal40_2: clean(data?.distanceTotal40_2),
                distanceLoaded41_2: clean(data?.distanceLoaded41_2), cargoWeightTotal42_2: clean(data?.cargoWeightTotal42_2),
                cargoWeightTrailer43_2: clean(data?.cargoWeightTrailer43_2), tkmTotal44_2: clean(data?.tkmTotal44_2),
                tkmTrailer45_2: clean(data?.tkmTrailer45_2), salaryCode46_2: clean(data?.salaryCode46_2),
                salaryAmount47_2: clean(data?.salaryAmount47_2),

                codeVehicleModel: clean(data?.codeVehicleModel), codeTrailer: clean(data?.codeTrailer),
                codeSemiTrailer: clean(data?.codeSemiTrailer), autoDaysInWork: clean(data?.autoDaysInWork),

                isSaved: data?.isSaved ?? false,
                savedAt: data?.savedAt,
                securityStatus: data?.securityStatus,
                denyReason: data?.denyReason,
                dispatcherName: data?.dispatcherName
            });

            const transports = loadTransportRegistry();
            const plates = transports.map(tr => tr.plate).filter(Boolean);
            const drivers = Array.from(new Set(transports.flatMap(tr => tr.drivers.map(d => d.fullName)))).filter(Boolean);

            const p2t: Record<string, string> = {};
            transports.forEach(tr => {
                if (tr.plate && tr.vehicleType) {
                    p2t[tr.plate] = tr.vehicleType;
                }
            });

            setAllPlates(plates);
            setAllDrivers(drivers);
            setPlateToType(p2t);
        }
    }, [open, data]);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const next = { ...prev, [name]: value };
            if (name === 'plate' && plateToType[value]) {
                next.type = plateToType[value];
            }
            if (name === 'departureTime') {
                if (next.expectedReturn && new Date(value) > new Date(next.expectedReturn)) {
                    next.expectedReturn = value;
                }
            }
            if (name === 'expectedReturn') {
                if (next.departureTime && new Date(value) < new Date(next.departureTime)) {
                    next.expectedReturn = next.departureTime;
                }
            }
            return next;
        });
    };

    const handleSave = () => {
        onSave({
            ...formData,
            isSaved: true,
            savedAt: Date.now()
        });
        setIsEditing(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col w-screen h-screen bg-slate-950 overflow-hidden animate-in fade-in duration-200">
            {/* Full Screen Header Bar */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-700/60 px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-900/90 shadow-md gap-2">
                <div className="w-8 sm:w-10 hidden sm:block"></div>
                <h3 className="text-xs sm:text-base md:text-lg font-bold text-slate-100 flex items-center justify-center gap-1.5 sm:gap-2.5 text-center flex-1 leading-tight px-1">
                    <FileSpreadsheet className="text-blue-400 shrink-0 w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
                    <span className="line-clamp-2 sm:line-clamp-none">
                        Yo'l varaqasini shakllantirish (YUK AVTOMOBILI № 4-m namunaviy shakl)
                    </span>
                </h3>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 sm:p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors shrink-0"
                    title="Yopish"
                >
                    <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
            </div>

            {/* Form Document Body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 md:p-8 space-y-4 sm:space-y-6 text-slate-200 text-sm font-sans bg-slate-950/60 border-none m-0 dark-scrollbar min-w-0">
                <fieldset disabled={!isEditing} className="contents">
                <datalist id="drivers-list">
                    {allDrivers.map((d, i) => <option key={i} value={d} />)}
                </datalist>
                <datalist id="plates-list">
                    {allPlates.map((p, i) => <option key={i} value={p} />)}
                </datalist>

                {/* TOP SECTION: Left Info + Right Work & Fuel Tables */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* LEFT COLUMN: Document Header & Vehicle Details */}
                    <div className="lg:col-span-5 border border-slate-700/60 rounded-xl p-4 bg-slate-900/60 space-y-3.5 shadow-md">


                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-1">
                            <div className="flex items-center gap-2 justify-between sm:justify-start">
                                <span className="font-bold text-sm sm:text-base text-blue-400 whitespace-nowrap">YO'L VARAQASI №</span>
                                <input
                                    type="text"
                                    name="waybillNo"
                                    value={formData.waybillNo || ''}
                                    onChange={handleChange}
                                    className="bg-slate-950/60 border border-slate-700/60 rounded px-2.5 py-1 text-slate-100 font-bold text-sm w-28 sm:w-32 text-center"
                                    placeholder=""
                                />
                            </div>
                            <div className="flex items-center gap-2 justify-between sm:justify-end">
                                <span className="font-medium text-slate-300 text-xs sm:text-sm shrink-0">Sana:</span>
                                <input
                                    type="date"
                                    name="waybillDate"
                                    value={formData.waybillDate || ''}
                                    onChange={handleChange}
                                    className="bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-xs sm:text-sm min-w-0"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/40 text-xs">
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-300 shrink-0 font-medium">Ish rejimi:</span>
                                <input type="text" name="workRegime" value={formData.workRegime || ''} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm" placeholder="" />
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-300 shrink-0 font-medium">Kod:</span>
                                <input type="text" name="regimeCode" value={formData.regimeCode || ''} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm" placeholder="" />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-300 shrink-0 font-medium">Kolonna:</span>
                            <input type="text" name="columnNo" value={formData.columnNo || ''} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm" placeholder="" />
                        </div>

                        {/* Vehicle Details */}
                        <div className="space-y-2 pt-2 border-t border-slate-700/40">
                            <div className="text-xs font-semibold text-slate-200">Avtomobil (rusumi, davlat raqami, tip):</div>
                            <div className="grid grid-cols-3 gap-1.5">
                                <input type="text" name="vehicleModel" value={formData.vehicleModel || ''} onChange={handleChange} placeholder="" className="bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm" />
                                <input type="text" name="plate" value={formData.plate} onChange={handleChange} list="plates-list" placeholder="" className="bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 font-semibold text-sm" />
                                <input type="text" name="type" value={formData.type} onChange={handleChange} placeholder="" className="bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm" />
                            </div>
                        </div>

                        {/* Driver Details */}
                        <div className="space-y-2 pt-2 border-t border-slate-700/40">
                            <div className="text-xs font-semibold text-slate-200">1. Haydovchi F.I.SH. / Tab № / Klassi:</div>
                            <div className="grid grid-cols-12 gap-1.5">
                                <input type="text" name="driver" value={formData.driver} onChange={handleChange} list="drivers-list" placeholder="" className="col-span-6 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 font-semibold text-sm" />
                                <input type="text" name="tabNo" value={formData.tabNo || ''} onChange={handleChange} placeholder="" className="col-span-3 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm" />
                                <input type="text" name="driverClass" value={formData.driverClass || ''} onChange={handleChange} placeholder="" className="col-span-3 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm" />
                            </div>
                        </div>

                        {/* Trailer Details */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/40">
                            <div>
                                <span className="text-slate-300 text-xs font-medium">Tirkama (rusumi, raqami):</span>
                                <input type="text" name="trailerPlate" value={formData.trailerPlate || ''} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm mt-0.5" placeholder="" />
                            </div>
                            <div>
                                <span className="text-slate-300 text-xs font-medium">Yarimtirkama:</span>
                                <input type="text" name="semiTrailerPlate" value={formData.semiTrailerPlate || ''} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm mt-0.5" placeholder="" />
                            </div>
                        </div>

                        <div>
                            <span className="text-slate-300 text-xs font-medium">Hamkorlik qiluvchi shaxslar:</span>
                            <input type="text" name="companions" value={formData.companions || ''} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm mt-0.5" placeholder="" />
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Tables 1-6 (Work) & 7-14 (Fuel) */}
                    <div className="lg:col-span-7 space-y-4">
                        {/* TABLE 1-6: Haydovchi va avtomobilning ishi */}
                        <div className="border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900/60 shadow-md">
                            <div className="bg-slate-800/80 px-3 py-1.5 font-bold text-slate-200 text-sm text-center border-b border-slate-700/60">
                                Haydovchi va avtomobilning ishi
                            </div>
                            <div className="overflow-x-auto touch-pan-x dark-scrollbar max-w-full">
                                <table className="w-full text-center border-collapse min-w-[600px]">
                                    <thead>
                                        <tr className="bg-slate-950/60 text-xs text-slate-300 border-b border-slate-700/60">
                                            <th className="p-1.5 border-r border-slate-700/50 w-28">Operatsiya</th>
                                            <th className="p-1.5 border-r border-slate-700/50">Jadval bo'yicha vaqt</th>
                                            <th className="p-1.5 border-r border-slate-700/50">Pulli masofa, km</th>
                                            <th className="p-1.5 border-r border-slate-700/50">Spidometr ko'rsatgichlari</th>
                                            <th className="p-1.5">Amaldagi vaqt</th>
                                        </tr>
                                        <tr className="bg-slate-900/40 text-[11px] text-slate-400 border-b border-slate-700/60">
                                            <th className="py-0.5 border-r border-slate-700/50">1</th>
                                            <th className="py-0.5 border-r border-slate-700/50">2 - 3</th>
                                            <th className="py-0.5 border-r border-slate-700/50">4</th>
                                            <th className="py-0.5 border-r border-slate-700/50">5</th>
                                            <th className="py-0.5">6</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/50 text-sm">
                                        <tr>
                                            <td className="p-1.5 font-medium border-r border-slate-700/50 bg-slate-950/20 text-xs">Garajdan chiqish</td>
                                            <td className="p-1 border-r border-slate-700/50">
                                                <input type="datetime-local" name="departureTime" value={formData.departureTime} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200 text-sm" />
                                            </td>
                                            <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                                <input type="text" name="paidDistance" value={formData.paidDistance || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200 text-sm" />
                                            </td>
                                            <td className="p-1 border-r border-slate-700/50">
                                                <input type="text" name="odometerOut" value={formData.odometerOut || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200 text-sm" />
                                            </td>
                                            <td className="p-1">
                                                <input type="text" name="actualDeparture" value={formData.actualDeparture || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200 text-sm" />
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="p-1.5 font-medium border-r border-slate-700/50 bg-slate-950/20 text-xs">Garajga qaytish</td>
                                            <td className="p-1 border-r border-slate-700/50">
                                                <input type="datetime-local" name="expectedReturn" value={formData.expectedReturn} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200 text-sm" />
                                            </td>
                                            <td className="p-1 border-r border-slate-700/50">
                                                <input type="text" name="odometerIn" value={formData.odometerIn || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200 text-sm" />
                                            </td>
                                            <td className="p-1">
                                                <input type="text" name="actualReturn" value={formData.actualReturn || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200 text-sm" />
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                            {/* TABLE 7-14: Yonilg'i harajati, litr */}
                            <div className="border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900/60 shadow-md">
                                <div className="bg-slate-800/80 px-3 py-1.5 font-bold text-slate-200 text-sm text-center border-b border-slate-700/60">
                                    yonilg'i harajati, litr
                                </div>
                                <div className="overflow-x-auto touch-pan-x dark-scrollbar max-w-full">
                                    <table className="w-full text-center border-collapse min-w-[700px]">
                                        <thead>
                                            <tr className="bg-slate-950/60 text-xs text-slate-300 border-b border-slate-700/60">
                                                <th className="p-1 border-r border-slate-700/50" rowSpan={2}>yonilg'i markasi</th>
                                                <th className="p-1 border-r border-slate-700/50" rowSpan={2}>Marka kodi</th>
                                                <th className="p-1 border-r border-slate-700/50" rowSpan={2}>Berildi</th>
                                                <th className="p-1 border-r border-slate-700/50" colSpan={2}>Qoldiq</th>
                                                <th className="p-1 border-r border-slate-700/50 text-[11px]" rowSpan={2}>Norma o'zlashtirish koeffisenti</th>
                                                <th className="p-1" colSpan={2}>ishlash vaqti, soat</th>
                                            </tr>
                                            <tr className="bg-slate-900/40 text-[11px] text-slate-400 border-b border-slate-700/60">
                                                <th className="py-0.5 border-r border-slate-700/50">chiqishda</th>
                                                <th className="py-0.5 border-r border-slate-700/50">qaytishda</th>
                                                <th className="py-0.5 border-r border-slate-700/50">Maxsus uskuna</th>
                                                <th className="py-0.5">dvigatel</th>
                                            </tr>
                                            <tr className="bg-slate-950/40 text-[10px] text-slate-500 border-b border-slate-700/60">
                                                <th className="py-0.5 border-r border-slate-700/50">7</th>
                                                <th className="py-0.5 border-r border-slate-700/50">8</th>
                                                <th className="py-0.5 border-r border-slate-700/50">9</th>
                                                <th className="py-0.5 border-r border-slate-700/50">10</th>
                                                <th className="py-0.5 border-r border-slate-700/50">11</th>
                                                <th className="py-0.5 border-r border-slate-700/50">12</th>
                                                <th className="py-0.5 border-r border-slate-700/50">13</th>
                                                <th className="py-0.5">14</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* Fuel Row 1 */}
                                            <tr>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelType" value={formData.fuelType || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelCode" value={formData.fuelCode || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelGiven" value={formData.fuelGiven || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 font-bold text-blue-400 text-sm" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelOut" value={formData.fuelOut || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelIn" value={formData.fuelIn || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelNormCoef" value={formData.fuelNormCoef || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="specialEquipmentHours" value={formData.specialEquipmentHours || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                                <td className="p-1">
                                                    <input type="text" name="engineHours" value={formData.engineHours || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                            </tr>

                                            {/* Fuel Row 2 */}
                                            <tr className="border-t border-slate-700/40">
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelType2" value={formData.fuelType2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelCode2" value={formData.fuelCode2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelGiven2" value={formData.fuelGiven2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 font-bold text-blue-400 text-sm" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelOut2" value={formData.fuelOut2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelIn2" value={formData.fuelIn2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelNormCoef2" value={formData.fuelNormCoef2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="specialEquipmentHours2" value={formData.specialEquipmentHours2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                                <td className="p-1">
                                                    <input type="text" name="engineHours2" value={formData.engineHours2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-sm" />
                                                </td>
                                            </tr>

                                            {/* Signatures Role Header Row */}
                                            <tr className="bg-slate-950/80 text-[11px] font-semibold text-slate-300 border-t border-slate-700/60">
                                                <td className="p-1 border-r border-slate-700/50 italic">imzolar</td>
                                                <td className="p-1 border-r border-slate-700/50" colSpan={2}>Yonilg'i quyuvchi</td>
                                                <td className="p-1 border-r border-slate-700/50">Nav.mex</td>
                                                <td className="p-1 border-r border-slate-700/50">Nav.mex</td>
                                                <td className="p-1" colSpan={3}>Dispetcher</td>
                                            </tr>

                                            {/* Signatures Input Row */}
                                            <tr className="border-t border-slate-700/40 bg-slate-950/40">
                                                <td className="p-1 border-r border-slate-700/50"></td>
                                                <td className="p-1 border-r border-slate-700/50" colSpan={2}>
                                                    <input type="text" name="fuelerSignature" value={formData.fuelerSignature || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-xs" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="mechanicOutSignature" value={formData.mechanicOutSignature || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-xs" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="mechanicInSignature" value={formData.mechanicInSignature || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-xs" />
                                                </td>
                                                <td className="p-1" colSpan={3}>
                                                    <input type="text" name="dispatcherSignature" value={formData.dispatcherSignature || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-xs" />
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                    </div>
                </div>

                    {/* MIDDLE SECTION: XAYDOVCHIGA TOPSHIRIQ TABLE (Columns 15-22) */}
                    <div className="border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900/60 shadow-md">
                        <div className="bg-slate-800/80 px-4 py-2 font-bold text-slate-200 text-sm text-center border-b border-slate-700/60 flex items-center justify-center gap-2">
                            <span>XAYDOVCHIGA TOPSHIRIQ</span>
                        </div>
                        <div className="overflow-x-auto touch-pan-x dark-scrollbar max-w-full">
                            <table className="w-full text-center border-collapse min-w-[850px]">
                                <thead>
                                    <tr className="bg-slate-950/60 text-xs text-slate-300 border-b border-slate-700/60">
                                        <th className="p-2 border-r border-slate-700/50 min-w-[140px]">Kimning ixtiyoriga</th>
                                        <th className="p-2 border-r border-slate-700/50 min-w-[110px]">Kelish vaqti<br/><span className="text-[10px] text-slate-400 font-normal">(soat, daqiqa)</span></th>
                                        <th className="p-2 border-r border-slate-700/50 min-w-[140px]">Yuk qayerdan olinadi</th>
                                        <th className="p-2 border-r border-slate-700/50 min-w-[160px]">Yuk qayerga yetkaziladi</th>
                                        <th className="p-2 border-r border-slate-700/50 min-w-[130px]">Yukning nomi</th>
                                        <th className="p-2 border-r border-slate-700/50 min-w-[110px]">Yuk bilan qatnovlar soni</th>
                                        <th className="p-2 border-r border-slate-700/50 min-w-[90px]">Masofa, km</th>
                                        <th className="p-2 min-w-[130px]">Tashilishi kerak yuk hajmi, tonna</th>
                                    </tr>
                                    <tr className="bg-slate-900/40 text-[11px] text-slate-400 border-b border-slate-700/60">
                                        <th className="py-0.5 border-r border-slate-700/50">15</th>
                                        <th className="py-0.5 border-r border-slate-700/50">16</th>
                                        <th className="py-0.5 border-r border-slate-700/50">17</th>
                                        <th className="py-0.5 border-r border-slate-700/50">18</th>
                                        <th className="py-0.5 border-r border-slate-700/50">19</th>
                                        <th className="py-0.5 border-r border-slate-700/50">20</th>
                                        <th className="py-0.5 border-r border-slate-700/50">21</th>
                                        <th className="py-0.5">22</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Row 1 */}
                                    <tr className="hover:bg-white/5 transition-colors">
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="customer" value={formData.customer || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="arrivalTime" value={formData.arrivalTime || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="pickupLoc" value={formData.pickupLoc || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="route" value={formData.route || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 font-semibold text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="cargo" value={formData.cargo || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="number" name="tripsCount" value={formData.tripsCount || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="distance" value={formData.distance || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold text-sm" />
                                        </td>
                                        <td className="p-1">
                                            <input type="text" name="weight" value={formData.weight || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold text-sm" />
                                        </td>
                                    </tr>

                                    {/* Row 2 */}
                                    <tr className="hover:bg-white/5 transition-colors border-t border-slate-700/40">
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="customer2" value={formData.customer2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="arrivalTime2" value={formData.arrivalTime2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="pickupLoc2" value={formData.pickupLoc2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="route2" value={formData.route2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 font-semibold text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="cargo2" value={formData.cargo2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="number" name="tripsCount2" value={formData.tripsCount2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="distance2" value={formData.distance2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold text-sm" />
                                        </td>
                                        <td className="p-1">
                                            <input type="text" name="weight2" value={formData.weight2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold text-sm" />
                                        </td>
                                    </tr>

                                    {/* Row 3 */}
                                    <tr className="hover:bg-white/5 transition-colors border-t border-slate-700/40">
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="customer3" value={formData.customer3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="arrivalTime3" value={formData.arrivalTime3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="pickupLoc3" value={formData.pickupLoc3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="route3" value={formData.route3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 font-semibold text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="cargo3" value={formData.cargo3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="number" name="tripsCount3" value={formData.tripsCount3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="distance3" value={formData.distance3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold text-sm" />
                                        </td>
                                        <td className="p-1">
                                            <input type="text" name="weight3" value={formData.weight3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold text-sm" />
                                        </td>
                                    </tr>

                                    {/* Row 4 */}
                                    <tr className="hover:bg-white/5 transition-colors border-t border-slate-700/40">
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="customer4" value={formData.customer4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="arrivalTime4" value={formData.arrivalTime4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="pickupLoc4" value={formData.pickupLoc4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="route4" value={formData.route4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 font-semibold text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="cargo4" value={formData.cargo4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="number" name="tripsCount4" value={formData.tripsCount4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="distance4" value={formData.distance4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold text-sm" />
                                        </td>
                                        <td className="p-1">
                                            <input type="text" name="weight4" value={formData.weight4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold text-sm" />
                                        </td>
                                    </tr>

                                    {/* Row 5 */}
                                    <tr className="hover:bg-white/5 transition-colors border-t border-slate-700/40">
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="customer5" value={formData.customer5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="arrivalTime5" value={formData.arrivalTime5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="pickupLoc5" value={formData.pickupLoc5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="route5" value={formData.route5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 font-semibold text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="cargo5" value={formData.cargo5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="number" name="tripsCount5" value={formData.tripsCount5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 text-sm" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="distance5" value={formData.distance5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold text-sm" />
                                        </td>
                                        <td className="p-1">
                                            <input type="text" name="weight5" value={formData.weight5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold text-sm" />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                {/* BOTTOM SECTION: Replaced to match sample (image_2.png / yo'l_varaqasi.pdf) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-2">
                    {/* Column 1: Driver License, Fuel Order, Dispatcher & Medical */}
                    <div className="border border-slate-700/60 rounded-xl p-4 bg-slate-900/60 space-y-3.5 shadow-md flex flex-col justify-between">
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-200">
                                <span className="font-medium text-slate-300">Haydovchi guvohnomasini</span>
                                <input
                                    type="text"
                                    name="licenseCheck"
                                    value={formData.licenseCheck || ''}
                                    onChange={handleChange}
                                    className="flex-1 min-w-[100px] bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80 transition-colors"
                                />
                                <span className="font-medium text-slate-300">tekshirdim,</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-200">
                                <span className="font-medium text-slate-300">topshiruv berdim:</span>
                                <input
                                    type="text"
                                    name="fuelToGive"
                                    value={formData.fuelToGive || formData.fuelGiven || ''}
                                    onChange={handleChange}
                                    className="w-24 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 font-semibold text-center text-sm focus:outline-none focus:border-blue-500/80 transition-colors"
                                />
                                <span className="font-medium text-slate-300">litr yonilg'i berilsin</span>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-slate-200 pt-1">
                                <span className="font-medium text-slate-300 shrink-0">Dispetcher imzosi</span>
                                <input
                                    type="text"
                                    name="dispatcherSignature"
                                    value={formData.dispatcherSignature || ''}
                                    onChange={handleChange}
                                    className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="space-y-3 pt-2 border-t border-slate-800/80">
                            <div className="text-sm font-medium text-slate-200 leading-snug">
                                Haydovchi sog'ligi holatiga ko'ra boshqarishga qo'yiladi
                            </div>

                            <div className="flex items-center gap-2 text-sm text-slate-200">
                                <span className="font-medium text-slate-300 shrink-0">Imzo:</span>
                                <input
                                    type="text"
                                    name="doctorSignature"
                                    value={formData.doctorSignature || ''}
                                    onChange={handleChange}
                                    className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80 transition-colors"
                                />
                            </div>

                            <div className="text-center pt-1">
                                <div className="inline-block border-t border-slate-600 px-6 pt-0.5 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                                    Shtamp
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Vehicle Technical Condition & Signatures */}
                    <div className="border border-slate-700/60 rounded-xl p-4 bg-slate-900/60 space-y-3.5 shadow-md flex flex-col justify-between">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-slate-200">
                                <span className="font-medium text-slate-300 shrink-0">Avtomobil texnik soz</span>
                                <input
                                    type="text"
                                    name="mechanicOutApproval"
                                    value={formData.mechanicOutApproval || ''}
                                    onChange={handleChange}
                                    className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80 transition-colors"
                                />
                            </div>

                            <div className="flex items-center gap-2 text-sm text-slate-200">
                                <span className="font-medium text-slate-300 shrink-0">Chiqishga ruxsat berildi. nav,mex, imzo</span>
                                <input
                                    type="text"
                                    name="mechanicOutSignature"
                                    value={formData.mechanicOutSignature || ''}
                                    onChange={handleChange}
                                    className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80 transition-colors"
                                />
                            </div>

                            <div className="flex items-center gap-2 text-sm text-slate-200">
                                <span className="font-medium text-slate-300 shrink-0">Avtomobilni qabul qildim, haydovchi imzosi</span>
                                <input
                                    type="text"
                                    name="driverOutSignature"
                                    value={formData.driverOutSignature || ''}
                                    onChange={handleChange}
                                    className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="space-y-3 pt-2 border-t border-slate-800/80">
                            <div className="flex items-center justify-between gap-2 text-sm text-slate-200">
                                <span className="font-medium text-slate-300 shrink-0">Qaytishda avtomobil</span>
                                <div className="flex items-center gap-4 bg-slate-950/60 px-3 py-1 rounded-lg border border-slate-700/60">
                                    <label className="flex items-center gap-1.5 cursor-pointer text-sm font-semibold text-emerald-400">
                                        <input
                                            type="radio"
                                            name="techInStatus"
                                            value="Soz"
                                            checked={formData.techInStatus === 'Soz' || !formData.techInStatus}
                                            onChange={handleChange}
                                            className="accent-emerald-500"
                                        />
                                        Soz
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer text-sm font-semibold text-rose-400">
                                        <input
                                            type="radio"
                                            name="techInStatus"
                                            value="Nosoz"
                                            checked={formData.techInStatus === 'Nosoz'}
                                            onChange={handleChange}
                                            className="accent-rose-500"
                                        />
                                        Nosoz
                                    </label>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-slate-200">
                                <span className="font-medium text-slate-300 shrink-0">Haydovchi topshirdi</span>
                                <input
                                    type="text"
                                    name="driverInSignature"
                                    value={formData.driverInSignature || ''}
                                    onChange={handleChange}
                                    className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80 transition-colors"
                                />
                            </div>

                            <div className="flex items-center gap-2 text-sm text-slate-200">
                                <span className="font-medium text-slate-300 shrink-0">Qabul qildim nav mex</span>
                                <input
                                    type="text"
                                    name="mechanicInSignature"
                                    value={formData.mechanicInSignature || ''}
                                    onChange={handleChange}
                                    className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80 transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Column 3: Alohida Qaydlar */}
                    <div className="border border-slate-700/60 rounded-xl p-4 bg-slate-900/60 space-y-3 shadow-md flex flex-col">
                        <div className="flex items-center gap-2 text-sm text-slate-200">
                            <span className="font-bold text-slate-200 shrink-0">Alohida qaydlar</span>
                        </div>
                        <textarea
                            name="specialNotes"
                            value={formData.specialNotes || ''}
                            onChange={handleChange}
                            rows={8}
                            placeholder=""
                            className="w-full flex-1 bg-slate-950/60 border border-slate-700/60 focus:border-blue-400 rounded-lg p-2.5 text-slate-200 text-sm resize-none outline-none transition-colors"
                        />
                    </div>
                </div>

                {/* NEW SECTION: TOPSHIRIWNI BAJARILISHI IZCHILLIGI & LINIYADA TURIB QOLISHLAR */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
                    {/* LEFT TABLE: TOPSHIRIWNI BAJARILISHI IZCHILLIGI (Cols 24-25) */}
                    <div className="lg:col-span-6 border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900/60 shadow-md flex flex-col">
                        <div className="bg-slate-800/80 px-3 py-2 font-bold text-slate-200 text-center border-b border-slate-700/60 text-sm tracking-wide uppercase">
                            TOPSHIRIWNI BAJARILISHI IZCHILLIGI
                        </div>
                        <div className="overflow-x-auto touch-pan-x dark-scrollbar flex-1 max-w-full">
                            <table className="w-full text-center border-collapse min-w-[500px]">
                                <thead>
                                    <tr className="bg-slate-950/60 text-xs text-slate-300 border-b border-slate-700/60">
                                        <th className="p-2 border-r border-slate-700/50 min-w-[200px]">
                                            Ilova qilingan tovar-transport nakladnoylar raqamlari
                                        </th>
                                        <th className="p-2 min-w-[200px]">
                                            yukni jo'natuvchining imzosi va muxri
                                        </th>
                                    </tr>
                                    <tr className="bg-slate-900/40 text-[11px] text-slate-400 border-b border-slate-700/60">
                                        <th className="py-0.5 border-r border-slate-700/50">24</th>
                                        <th className="py-0.5">25</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/40">
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map((rowNum) => {
                                        const noKey = `ttnNo${rowNum}` as keyof typeof formData;
                                        const sigKey = `ttnSig${rowNum}` as keyof typeof formData;
                                        return (
                                            <tr key={rowNum} className="hover:bg-white/5 transition-colors">
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input
                                                        type="text"
                                                        name={noKey}
                                                        value={(formData[noKey] as string) || ''}
                                                        onChange={handleChange}
                                                        placeholder=""
                                                        className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80"
                                                    />
                                                </td>
                                                <td className="p-1">
                                                    <input
                                                        type="text"
                                                        name={sigKey}
                                                        value={(formData[sigKey] as string) || ''}
                                                        onChange={handleChange}
                                                        placeholder=""
                                                        className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: LINIYADA TURIB QOLISHLAR & TAKSIROFKA */}
                    <div className="lg:col-span-6 space-y-4 flex flex-col justify-between">
                        {/* Table: LINIYADA TURIB QOLISHLAR (Cols 26-30) */}
                        <div className="border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900/60 shadow-md">
                            <div className="bg-slate-800/80 px-3 py-2 font-bold text-slate-200 text-center border-b border-slate-700/60 text-sm tracking-wide uppercase">
                                LINIYADA TURIB QOLISHLAR
                            </div>
                            <div className="overflow-x-auto touch-pan-x dark-scrollbar max-w-full">
                                <table className="w-full text-center border-collapse min-w-[550px]">
                                    <thead>
                                        <tr className="bg-slate-950/60 text-xs text-slate-300 border-b border-slate-700/60">
                                            <th className="p-1.5 border-r border-slate-700/50 min-w-[100px]" rowSpan={2}>Nomi</th>
                                            <th className="p-1.5 border-r border-slate-700/50 min-w-[60px]" rowSpan={2}>kod</th>
                                            <th className="p-1 border-r border-slate-700/50" colSpan={2}>sana va vaqt</th>
                                            <th className="p-1.5 min-w-[120px]" rowSpan={2}>Mas'ul shaxs imzosi</th>
                                        </tr>
                                        <tr className="bg-slate-900/40 text-[11px] text-slate-400 border-b border-slate-700/60">
                                            <th className="py-0.5 border-r border-slate-700/50 min-w-[90px]">boshlanishi</th>
                                            <th className="py-0.5 border-r border-slate-700/50 min-w-[90px]">tugallash</th>
                                        </tr>
                                        <tr className="bg-slate-950/40 text-[10px] text-slate-500 border-b border-slate-700/60">
                                            <th className="py-0.5 border-r border-slate-700/50">26</th>
                                            <th className="py-0.5 border-r border-slate-700/50">27</th>
                                            <th className="py-0.5 border-r border-slate-700/50">28</th>
                                            <th className="py-0.5 border-r border-slate-700/50">29</th>
                                            <th className="py-0.5">30</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/40">
                                        {[1, 2, 3, 4].map((rowNum) => {
                                            const nameKey = `delayName${rowNum}` as keyof typeof formData;
                                            const codeKey = `delayCode${rowNum}` as keyof typeof formData;
                                            const startKey = `delayStart${rowNum}` as keyof typeof formData;
                                            const endKey = `delayEnd${rowNum}` as keyof typeof formData;
                                            const sigKey = `delaySig${rowNum}` as keyof typeof formData;
                                            return (
                                                <tr key={rowNum} className="hover:bg-white/5 transition-colors">
                                                    <td className="p-1 border-r border-slate-700/50">
                                                        <input
                                                            type="text"
                                                            name={nameKey}
                                                            value={(formData[nameKey] as string) || ''}
                                                            onChange={handleChange}
                                                            className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80"
                                                        />
                                                    </td>
                                                    <td className="p-1 border-r border-slate-700/50">
                                                        <input
                                                            type="text"
                                                            name={codeKey}
                                                            value={(formData[codeKey] as string) || ''}
                                                            onChange={handleChange}
                                                            className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200 text-sm focus:outline-none focus:border-blue-500/80"
                                                        />
                                                    </td>
                                                    <td className="p-1 border-r border-slate-700/50">
                                                        <input
                                                            type="text"
                                                            name={startKey}
                                                            value={(formData[startKey] as string) || ''}
                                                            onChange={handleChange}
                                                            className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200 text-sm focus:outline-none focus:border-blue-500/80"
                                                        />
                                                    </td>
                                                    <td className="p-1 border-r border-slate-700/50">
                                                        <input
                                                            type="text"
                                                            name={endKey}
                                                            value={(formData[endKey] as string) || ''}
                                                            onChange={handleChange}
                                                            className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200 text-sm focus:outline-none focus:border-blue-500/80"
                                                        />
                                                    </td>
                                                    <td className="p-1">
                                                        <input
                                                            type="text"
                                                            name={sigKey}
                                                            value={(formData[sigKey] as string) || ''}
                                                            onChange={handleChange}
                                                            className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80"
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* TAKSIROFKA */}
                        <div className="border border-slate-700/60 rounded-xl p-4 bg-slate-900/60 space-y-2 shadow-md flex-1 flex flex-col">
                            <div className="font-bold text-slate-200 text-sm uppercase tracking-wide">
                                TAKSIROFKA
                            </div>
                            <textarea
                                name="taksirofkaNotes"
                                value={formData.taksirofkaNotes || ''}
                                onChange={handleChange}
                                rows={3}
                                placeholder=""
                                className="w-full flex-1 bg-slate-950/60 border border-slate-700/60 rounded-lg p-2.5 text-slate-200 text-sm resize-none outline-none focus:border-blue-500/80 transition-colors"
                            />
                        </div>
                    </div>
                </div>

                {/* NEW SECTION: TTX Header, Avtomobilning ish natijalari & ish haqi Table (Cols 31-47) */}
                <div className="space-y-4 pt-2 min-w-0">
                    {/* Header Bar: TTX Soni & Signatures */}
                    <div className="border border-slate-700/60 rounded-xl p-3 sm:p-4 bg-slate-900/60 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs sm:text-sm text-slate-200 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-200">TTX soni:</span>
                            <input
                                type="text"
                                name="ttxCount"
                                value={formData.ttxCount || ''}
                                onChange={handleChange}
                                placeholder=""
                                className="w-16 sm:w-20 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-center text-slate-100 font-semibold text-xs sm:text-sm"
                            />
                            <input
                                type="text"
                                name="ttxCountInWords"
                                value={formData.ttxCountInWords || ''}
                                onChange={handleChange}
                                placeholder="(yozuv bilan)"
                                className="flex-1 min-w-[120px] bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-xs sm:text-sm"
                            />
                            <span className="text-slate-300">ta</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800/60">
                            <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                                <span className="text-slate-300 shrink-0">Topshirdi:</span>
                                <input
                                    type="text"
                                    name="driverHandoverSig"
                                    value={formData.driverHandoverSig || ''}
                                    onChange={handleChange}
                                    placeholder="(imzo)"
                                    className="w-full min-w-0 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-xs sm:text-sm"
                                />
                            </div>
                            <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                                <span className="text-slate-300 shrink-0">Qabul qildim:</span>
                                <input
                                    type="text"
                                    name="dispatcherReceiveSig"
                                    value={formData.dispatcherReceiveSig || ''}
                                    onChange={handleChange}
                                    placeholder="(imzo)"
                                    className="w-full min-w-0 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-xs sm:text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Table: Avtomobilning ish natijalari & ish haqi (Cols 31-47) */}
                    <div className="border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900/60 shadow-md min-w-0">
                        <div className="overflow-x-auto touch-pan-x dark-scrollbar max-w-full">
                            <table className="w-full text-center border-collapse min-w-[1150px]">
                                <thead>
                                    {/* Main Group Headers */}
                                    <tr className="bg-slate-800/90 text-sm font-bold text-slate-200 border-b border-slate-700/60">
                                        <th colSpan={15} className="p-2 border-r border-slate-700/60 uppercase tracking-wide">
                                            Avtomobilning ish natijalari
                                        </th>
                                        <th colSpan={2} className="p-2 uppercase tracking-wide">
                                            ish haqi
                                        </th>
                                    </tr>
                                    {/* Detailed Category Headers */}
                                    <tr className="bg-slate-950/60 text-xs text-slate-300 border-b border-slate-700/60">
                                        <th colSpan={2} className="p-1.5 border-r border-slate-700/50">Yonilg'i sarfi (litr, m.kub)</th>
                                        <th colSpan={2} className="p-1.5 border-r border-slate-700/50"></th>
                                        <th colSpan={4} className="p-1.5 border-r border-slate-700/50">Turib qolishlar</th>
                                        <th rowSpan={3} className="p-1.5 border-r border-slate-700/50 min-w-[90px]">Yuk bilan qatnov soni</th>
                                        <th colSpan={2} className="p-1.5 border-r border-slate-700/50">Bosib o'tilgan masofa</th>
                                        <th colSpan={2} className="p-1.5 border-r border-slate-700/50">Tashilgan yuk hajmi tonnada</th>
                                        <th colSpan={2} className="p-1.5 border-r border-slate-700/50">Bajarilgan tkm</th>
                                        <th rowSpan={3} className="p-1.5 border-r border-slate-700/50 min-w-[50px]">kod</th>
                                        <th rowSpan={3} className="p-1.5 min-w-[60px]">so'm</th>
                                    </tr>
                                    {/* Sub-column Title Row 1 */}
                                    <tr className="bg-slate-900/40 text-[11px] text-slate-400 border-b border-slate-700/60">
                                        <th rowSpan={2} className="py-1 border-r border-slate-700/50 min-w-[65px]">Norma bo'yicha</th>
                                        <th rowSpan={2} className="py-1 border-r border-slate-700/50 min-w-[60px]">Amalda</th>
                                        <th rowSpan={2} className="py-1 border-r border-slate-700/50 min-w-[55px]">Jami</th>
                                        <th rowSpan={2} className="py-1 border-r border-slate-700/50 min-w-[65px]">Xarakatda</th>
                                        <th rowSpan={2} className="py-1 border-r border-slate-700/50 min-w-[55px]">Jami</th>
                                        <th colSpan={2} className="py-1 border-r border-slate-700/50">Ortish va tushirishda</th>
                                        <th rowSpan={2} className="py-1 border-r border-slate-700/50 min-w-[75px]">Texnik nosozlik bo'yicha</th>
                                        <th rowSpan={2} className="py-1 border-r border-slate-700/50 min-w-[55px]">Jami</th>
                                        <th rowSpan={2} className="py-1 border-r border-slate-700/50 min-w-[75px]">Sh.j-yuk bilan</th>
                                        <th rowSpan={2} className="py-1 border-r border-slate-700/50 min-w-[55px]">Jami</th>
                                        <th rowSpan={2} className="py-1 border-r border-slate-700/50 min-w-[75px]">Sh.j tirkama bilan</th>
                                        <th rowSpan={2} className="py-1 border-r border-slate-700/50 min-w-[55px]">Jami</th>
                                        <th rowSpan={2} className="py-1 border-r border-slate-700/50 min-w-[75px]">Sh.j tirkama bilan</th>
                                    </tr>
                                    {/* Sub-column Title Row 2 (Ortish va tushirishda sub-headers) */}
                                    <tr className="bg-slate-900/40 text-[11px] text-slate-400 border-b border-slate-700/60">
                                        <th className="py-1 border-r border-slate-700/50 min-w-[55px]">Jami</th>
                                        <th className="py-1 border-r border-slate-700/50 min-w-[75px]">Normativdan ortiq</th>
                                    </tr>
                                    {/* Column Numbers 31-47 */}
                                    <tr className="bg-slate-950/40 text-[11px] text-slate-400 border-b border-slate-700/60 font-semibold">
                                        <th className="py-0.5 border-r border-slate-700/50">31</th>
                                        <th className="py-0.5 border-r border-slate-700/50">32</th>
                                        <th className="py-0.5 border-r border-slate-700/50">33</th>
                                        <th className="py-0.5 border-r border-slate-700/50">34</th>
                                        <th className="py-0.5 border-r border-slate-700/50">35</th>
                                        <th className="py-0.5 border-r border-slate-700/50">36</th>
                                        <th className="py-0.5 border-r border-slate-700/50">37</th>
                                        <th className="py-0.5 border-r border-slate-700/50">38</th>
                                        <th className="py-0.5 border-r border-slate-700/50">39</th>
                                        <th className="py-0.5 border-r border-slate-700/50">40</th>
                                        <th className="py-0.5 border-r border-slate-700/50">41</th>
                                        <th className="py-0.5 border-r border-slate-700/50">42</th>
                                        <th className="py-0.5 border-r border-slate-700/50">43</th>
                                        <th className="py-0.5 border-r border-slate-700/50">44</th>
                                        <th className="py-0.5 border-r border-slate-700/50">45</th>
                                        <th className="py-0.5 border-r border-slate-700/50">46</th>
                                        <th className="py-0.5">47</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/40">
                                    <tr className="hover:bg-white/5 transition-colors">
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="fuelNorm31" value={formData.fuelNorm31 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="fuelActual32" value={formData.fuelActual32 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="hoursTotal33" value={formData.hoursTotal33 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="hoursMoving34" value={formData.hoursMoving34 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="delaysTotal35" value={formData.delaysTotal35 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="loadingTotal36" value={formData.loadingTotal36 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="loadingOverNorm37" value={formData.loadingOverNorm37 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="techBreakdown38" value={formData.techBreakdown38 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="tripsWithCargo39" value={formData.tripsWithCargo39 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="distanceTotal40" value={formData.distanceTotal40 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="distanceLoaded41" value={formData.distanceLoaded41 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="cargoWeightTotal42" value={formData.cargoWeightTotal42 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="cargoWeightTrailer43" value={formData.cargoWeightTrailer43 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="tkmTotal44" value={formData.tkmTotal44 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                            <input type="text" name="tkmTrailer45" value={formData.tkmTrailer45 || ''} onChange={handleChange} className="w-full h-full min-h-[55px] bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80" />
                                        </td>

                                        <td className="p-1 border-r border-slate-700/50">
                                            <input
                                                type="text"
                                                name="salaryCode46"
                                                value={formData.salaryCode46 || ''}
                                                onChange={handleChange}
                                                className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80"
                                            />
                                        </td>
                                        <td className="p-1">
                                            <input
                                                type="text"
                                                name="salaryAmount47"
                                                value={formData.salaryAmount47 || ''}
                                                onChange={handleChange}
                                                className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80"
                                            />
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-white/5 transition-colors">
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input
                                                type="text"
                                                name="salaryCode46_2"
                                                value={formData.salaryCode46_2 || ''}
                                                onChange={handleChange}
                                                className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80"
                                            />
                                        </td>
                                        <td className="p-1">
                                            <input
                                                type="text"
                                                name="salaryAmount47_2"
                                                value={formData.salaryAmount47_2 || ''}
                                                onChange={handleChange}
                                                className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-sm text-slate-200 focus:outline-none focus:border-blue-500/80"
                                            />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Bottom Footer Bar: Vehicle & Trailer Codes + Days worked */}
                    <div className="border border-slate-700/60 rounded-xl p-3 sm:p-4 bg-slate-900/60 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs sm:text-sm text-slate-200 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <span className="font-bold text-slate-200 w-full sm:w-auto">Rusumlar kodi:</span>
                            <div className="flex items-center gap-1.5 flex-1 min-w-[110px]">
                                <span className="text-slate-300">Avto</span>
                                <input
                                    type="text"
                                    name="codeVehicleModel"
                                    value={formData.codeVehicleModel || ''}
                                    onChange={handleChange}
                                    className="w-full min-w-0 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-xs sm:text-sm"
                                />
                            </div>
                            <div className="flex items-center gap-1.5 flex-1 min-w-[110px]">
                                <span className="text-slate-300">Tirkama</span>
                                <input
                                    type="text"
                                    name="codeTrailer"
                                    value={formData.codeTrailer || ''}
                                    onChange={handleChange}
                                    className="w-full min-w-0 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-xs sm:text-sm"
                                />
                            </div>
                            <div className="flex items-center gap-1.5 flex-1 min-w-[110px]">
                                <span className="text-slate-300">Yarimtirkama</span>
                                <input
                                    type="text"
                                    name="codeSemiTrailer"
                                    value={formData.codeSemiTrailer || ''}
                                    onChange={handleChange}
                                    className="w-full min-w-0 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-xs sm:text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800/60 justify-between md:justify-end">
                            <span className="font-medium text-slate-200">Avtomobil-kun ishda:</span>
                            <input
                                type="text"
                                name="autoDaysInWork"
                                value={formData.autoDaysInWork || ''}
                                onChange={handleChange}
                                className="w-20 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-center font-semibold text-slate-100 text-xs sm:text-sm"
                            />
                        </div>
                    </div>
                </div>
            </fieldset>
            </div>

            {/* Footer Controls */}
            <div className="flex shrink-0 items-center justify-between sm:justify-end gap-2 sm:gap-3 border-t border-slate-700/60 px-4 sm:px-6 py-2.5 sm:py-3.5 bg-slate-900/95 backdrop-blur-md shadow-2xl">
                <button
                    type="button"
                    onClick={() => setIsEditing(prev => !prev)}
                    className={`flex-1 sm:flex-none justify-center px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white transition-all flex items-center gap-2 shadow-lg ${
                        isEditing
                            ? 'bg-amber-500 hover:bg-amber-400 ring-2 ring-amber-400/50 shadow-amber-500/20'
                            : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                    }`}
                >
                    <Pencil size={18} />
                    {isEditing ? 'Tahrirlanmoqda' : 'Tahrirlash'}
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!isEditing}
                    className="flex-1 sm:flex-none justify-center px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save size={18} />
                    Saqlash
                </button>
            </div>
        </div>
    );
};



