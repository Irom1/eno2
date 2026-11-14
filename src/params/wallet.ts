import type { ParamMatcher } from '@sveltejs/kit';

export const match = ((value) => value === 'dashboard' || value === 'chat') satisfies ParamMatcher;
