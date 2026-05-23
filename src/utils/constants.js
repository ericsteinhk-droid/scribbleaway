export const ENTRY_TYPES = {
  observation: {
    label: 'Observation',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
    dot: 'bg-blue-500',
  },
  avancement: {
    label: 'Avancement des travaux',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    border: 'border-green-200 dark:border-green-800',
    dot: 'bg-green-500',
  },
  discussion: {
    label: 'Discussion',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  directive: {
    label: 'Directive',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
    dot: 'bg-red-500',
  },
}

export const ENTRY_TYPE_ORDER = ['observation', 'avancement', 'discussion', 'directive']

export const WEATHER_OPTIONS = [
  'Ensoleillé',
  'Nuageux',
  'Couvert',
  'Pluie légère',
  'Pluie forte',
  'Neige',
  'Vent fort',
  'Brouillard',
]
