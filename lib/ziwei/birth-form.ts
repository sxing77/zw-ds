export type BirthCalendar = 'solar' | 'lunar';

export interface BirthFormState {
  name: string;
  year: string;
  month: string;
  day: string;
  calendar?: BirthCalendar;
  clockHour: string;
  clockMinute: string;
  unknownTime: boolean;
  province: string;
  city: string;
  longitude: number;
  /** 当地标准时区偏移（分钟，东正西负），不填默认 480 (UTC+8) */
  utcOffsetMinutes?: number;
  gender: 'male' | 'female';
}

export type BirthProfile = { id: string; form: BirthFormState };

export const LAST_BIRTH_YEAR = 2026;
export const BIRTH_NAME_LIMIT = 40;
