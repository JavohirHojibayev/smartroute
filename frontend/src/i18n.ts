import { create } from 'zustand';

export type Language = 'uz' | 'ru';

export const uz = {
  dashboard: 'Boshqaruv paneli',
  fleet: 'Transportlar',
  drivers: 'Haydovchilar',
  fuel: "Yoqilg'i",
  waybills: "Yo'l varaqasi",
  reports: 'Hisobotlar',
  cargoStats: 'Yuk tashish hajmi',
  liveTracking: 'Tezkor xarita',
  smartStart: 'Smart Start',
  accessControl: 'Turniket Jurnal',
  medicalChecks: "Tibbiy ko'rik",
  vehicleInspections: "Texnik ko'rik",
  totalVehicles: 'Jami transport',
  tonnage: "Yuk ko'tarishi",
  volume: 'Hajmi',
  cargoType: 'Yuk turi',
  weight: "Og'irligi",
  utilization: 'Yuklanish samaradorligi',
  totalWeight: 'Jami tashilgan yuk',
  activeTrips: 'Faol safarlar',
  inRepair: "Ta'mirda",
  fuelEfficiency: "Yoqilg'i samaradorligi",
  benzin: 'Benzin',
  metan: 'Metan',
  settings: 'Sozlamalar',
  users: 'Foydalanuvchilar',
  roles: 'Rollar va huquqlar',
  admin: 'Administrator',
  dispatcher: 'Dispetcher',
  user: 'Foydalanuvchi',
  manager: 'Menejer',
  save: 'Saqlash',
  edit: 'Tahrirlash',
  delete: "O'chirish",
  permissions: 'Ruxsatlar',
};

export const ru = {
  dashboard: 'Дашборд',
  fleet: 'Транспорт',
  drivers: 'Водители',
  fuel: 'Топливо',
  waybills: 'Путевой лист',
  reports: 'Отчёты',
  cargoStats: 'Объем перевозок',
  liveTracking: 'Живая карта',
  smartStart: 'Смарт Старт',
  accessControl: 'Turniket Jurnal',
  medicalChecks: 'Медосмотр',
  vehicleInspections: 'Техконтроль',
  totalVehicles: 'Всеgo ТС',
  tonnage: 'Грузоподъемность',
  volume: 'Объем',
  cargoType: 'Тип груза',
  weight: 'Вес',
  utilization: 'Эффективность загрузки',
  totalWeight: 'Всего перевезено',
  activeTrips: 'Активные рейсы',
  inRepair: 'В ремонте',
  fuelEfficiency: 'Топливная эфф.',
  benzin: 'Бензин',
  diesel: 'Дизель (Салярка)',
  propan: 'Пропан',
  metan: 'Метан',
  settings: 'Настройки',
  users: 'Пользователи',
  roles: 'Роли и права',
  admin: 'Администратор',
  dispatcher: 'Диспетчер',
  user: 'Пользователь',
  manager: 'Менеджер',
  save: 'Сохранить',
  edit: 'Редактировать',
  delete: 'Удалить',
  permissions: 'Разрешения',
};

export const dicts = { uz, ru };

interface I18nState {
  lang: Language;
  t: (key: keyof typeof uz) => string;
  setLang: (lang: Language) => void;
}

export const useI18n = create<I18nState>((set, get) => ({
  lang: 'uz',
  t: (key) => dicts[get().lang][key],
  setLang: (lang) => set({ lang }),
}));
