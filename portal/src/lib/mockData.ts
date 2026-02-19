// portal/src/lib/mockData.ts

export const mockGovernanceMilestones = [
  {
    id: 'math-basics-2026Q3',
    skillIds: ['ols.math:fractions', 'ols.math:ratios'],
    description: 'Master basic proportional reasoning',
    targetDate: '2026-08-31',
    requiredPercent: 90,
    level: 'cohort'
  },
  {
    id: 'science-gravity-2026Q2',
    skillIds: ['ols.science:gravity'],
    description: 'Understand freefall and acceleration due to gravity',
    targetDate: '2026-06-30',
    requiredPercent: 85,
    level: 'regional'
  }
];

export const mockClasses = [
  {
    id: 'class-mixed-refugee',
    name: 'Mixed Entry-Level Group (New Arrivals + Long-term)',
    studentsCount: 18,
    onTrackPercent: 62,
    notes: 'High heterogeneity: 7 new arrivals, 5 long-term, 6 mid-level',
    entryLevels: [3, 7, 2, 5, 4, 1, 8, 9, 3, 6, 2, 7, 4, 5, 1, 8, 3, 6], // for spread calculation
    arrivalCohorts: [
      '2025Q4-new', 'long-term', '2026Q1-new', 'long-term',
      '2025Q4-new', '2026Q1-new', 'long-term', '2026Q1-new',
      '2025Q4-new', 'long-term', '2026Q1-new', 'long-term',
      '2025Q4-new', 'long-term', '2026Q1-new', 'long-term',
      '2025Q4-new', '2026Q1-new'
    ],
    students: [
      { id: 's1', name: 'Amina', entryLevel: 3, arrivalCohort: '2025Q4-new', masteredSkills: ['ols.math:counting'] },
      { id: 's2', name: 'Jamal', entryLevel: 7, arrivalCohort: 'long-term', masteredSkills: ['ols.math:fractions'] },
      { id: 's3', name: 'Sara', entryLevel: 2, arrivalCohort: '2026Q1-new', masteredSkills: [] },
      { id: 's4', name: 'Mohamed', entryLevel: 5, arrivalCohort: 'long-term', masteredSkills: ['ols.math:ratios'] },
      { id: 's5', name: 'Layla', entryLevel: 4, arrivalCohort: '2025Q4-new', masteredSkills: ['ols.math:counting'] },
      { id: 's6', name: 'Omar', entryLevel: 1, arrivalCohort: '2026Q1-new', masteredSkills: [] }
      // Add more if you want — array length should match studentsCount for realism
    ]
  },
  {
    id: 'class-advanced',
    name: 'Advanced Learners Group',
    studentsCount: 12,
    onTrackPercent: 88,
    notes: 'Mostly on-track; focus on acceleration',
    entryLevels: [8, 9, 7, 8, 9, 10, 8, 7, 9, 8, 9, 10],
    arrivalCohorts: Array(12).fill('long-term'),
    students: [
      { id: 's7', name: 'Layla', entryLevel: 9, arrivalCohort: 'long-term', masteredSkills: ['ols.math:ratios', 'ols.science:gravity'] },
      { id: 's8', name: 'Hassan', entryLevel: 8, arrivalCohort: 'long-term', masteredSkills: ['ols.math:fractions'] }
      // Add more if desired
    ]
  }
];

export const mockSkills = [
  { id: 'ols.math:ratios', title: 'Ratios & Proportions', difficulty: 4, metaphors: ['weaving', 'farming'] },
  { id: 'ols.math:fractions', title: 'Fractions Basics', difficulty: 3, metaphors: ['rhythm', 'sharing'] },
  { id: 'ols.science:gravity', title: 'Gravity & Freefall', difficulty: 3, metaphors: ['drop', 'fall'] }
];
