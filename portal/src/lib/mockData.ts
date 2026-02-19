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
    students: [
      { id: 's1', name: 'Amina', entryLevel: 3, arrivalCohort: '2025Q4-new', masteredSkills: ['ols.math:counting'] },
      { id: 's2', name: 'Jamal', entryLevel: 7, arrivalCohort: 'long-term', masteredSkills: ['ols.math:fractions'] },
      { id: 's3', name: 'Sara', entryLevel: 2, arrivalCohort: '2026Q1-new', masteredSkills: [] }
    ],
    governanceTargetStatus: { 'ols.math:ratios': 45, 'ols.science:gravity': 20 }
  }
];

export const mockSkills = [
  { id: 'ols.math:ratios', title: 'Ratios & Proportions', difficulty: 4, metaphors: ['weaving', 'farming'] },
  { id: 'ols.science:gravity', title: 'Gravity & Freefall', difficulty: 3, metaphors: ['drop', 'fall'] },
  { id: 'ols.math:fractions', title: 'Fractions Basics', difficulty: 3, metaphors: ['rhythm', 'sharing'] }
];
