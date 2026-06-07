import type { Timestamp } from 'firebase/firestore';

export type Letterhead = 'evoq' | 'nfoe-evoq';

export interface Project {
  id: string;
  name: string;
  address?: string;
  letterhead?: Letterhead;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Report {
  id: string;
  number: number;
  date: string;       // YYYY-MM-DD
  time?: string;      // HH:MM
  weather?: string;
  authorName: string;
  attendees: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  entryCount?: number;
  attendeeCount?: number;
}

export type EntryType = 'observation' | 'avancement' | 'discussion' | 'directive';

export interface Photo {
  id: string;
  url: string;
  storagePath: string;
  caption?: string;
}

export interface Entry {
  id: string;
  type: EntryType;
  content: string;
  photos: Photo[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type Screen =
  | 'splash'
  | 'auth'
  | 'projects'
  | 'reports'
  | 'report-detail';

export interface NavState {
  screen: Screen;
  projectId?: string;
  projectName?: string;
  projectAddress?: string;
  projectLetterhead?: Letterhead;
  reportId?: string;
  reportNumber?: number;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error';
}

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  observation: 'Observation',
  avancement: 'Avancement des travaux',
  discussion: 'Discussion',
  directive: 'Directive',
};

export const ENTRY_TYPE_COLORS: Record<EntryType, { bg: string; text: string; border: string; badge: string; dot: string }> = {
  observation: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    text: 'text-blue-800 dark:text-blue-200',
    border: 'border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    dot: 'bg-blue-500',
  },
  avancement: {
    bg: 'bg-green-50 dark:bg-green-950',
    text: 'text-green-800 dark:text-green-200',
    border: 'border-green-200 dark:border-green-800',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    dot: 'bg-green-500',
  },
  discussion: {
    bg: 'bg-amber-50 dark:bg-amber-950',
    text: 'text-amber-800 dark:text-amber-200',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    dot: 'bg-amber-500',
  },
  directive: {
    bg: 'bg-red-50 dark:bg-red-950',
    text: 'text-red-800 dark:text-red-200',
    border: 'border-red-200 dark:border-red-800',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    dot: 'bg-red-500',
  },
};

export const WEATHER_OPTIONS = [
  'Ensoleillé',
  'Nuageux',
  'Couvert',
  'Pluie légère',
  'Pluie forte',
  'Neige',
  'Vent fort',
  'Brouillard',
];
