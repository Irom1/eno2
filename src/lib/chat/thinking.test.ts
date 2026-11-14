import { describe, expect, it } from 'vitest';
import {
  THINKING_START,
  friendlyToolLabel,
  initialThinking,
  pushThinkingStep
} from './thinking';

function expectFriendly(label: string): void {
  expect(label).not.toMatch(/_/);
  expect(label.toLowerCase()).not.toContain('nessie');
  expect(label.toLowerCase()).not.toContain('insight');
  expect(label.toLowerCase()).not.toContain('tool');
}

describe('thinking steps', () => {
  it('starts on a single high-level step', () => {
    const state = initialThinking();
    expect(state.steps).toEqual([]);
    expect(state.current).toBe(THINKING_START);
  });

  it('maps every tool family to friendly product language', () => {
    const cases: Array<[string, string]> = [
      ['find_nearby_atms', 'Finding nearby locations'],
      ['find_nearby_branches', 'Finding nearby locations'],
      ['nessie_list_account_loans', 'Checking your loans'],
      ['insight_upcoming_bills', 'Checking upcoming bills'],
      ['nessie_list_customer_bills', 'Checking upcoming bills'],
      ['insight_recurring_charges', 'Finding recurring payments'],
      ['insight_anomalies', 'Scanning for unusual activity'],
      ['insight_spending_breakdown', 'Reviewing your spending'],
      ['get_rewards_summary', 'Checking your rewards'],
      ['insight_goal_projection', 'Projecting your savings goal'],
      ['nessie_list_merchants', 'Looking at where you shop'],
      ['insight_cash_flow', 'Reviewing your cash flow'],
      ['insight_cashflow', 'Reviewing your cash flow'],
      ['nessie_list_account_deposits', 'Reviewing recent transactions'],
      ['nessie_list_account_withdrawals', 'Reviewing recent transactions'],
      ['nessie_get_purchase', 'Reviewing recent transactions'],
      ['nessie_list_customer_accounts', 'Reviewing your accounts'],
      ['nessie_list_customers', 'Confirming your details'],
      ['nessie_get_customer', 'Confirming your details'],
      ['insight_financial_overview', 'Reviewing your finances']
    ];

    for (const [tool, expected] of cases) {
      expect(friendlyToolLabel(tool), tool).toBe(expected);
      expectFriendly(friendlyToolLabel(tool));
    }
  });

  it('uses a clean server label as fallback and rejects technical ones', () => {
    expect(friendlyToolLabel('mystery_tool', 'Checking a few things')).toBe(
      'Checking a few things'
    );
    expect(friendlyToolLabel('mystery_tool', 'nessie_internal_fetch')).toBe(
      'Looking that up'
    );
    expect(friendlyToolLabel('mystery_tool', 'insight_hidden')).toBe('Looking that up');
    expect(friendlyToolLabel('mystery_tool', 'has_underscore')).toBe('Looking that up');
    expect(friendlyToolLabel('mystery_tool')).toBe('Looking that up');
    expect(friendlyToolLabel('mystery_tool', '')).toBe('Looking that up');
  });

  it('moves the previous current step into ordered history', () => {
    let state = initialThinking();
    state = pushThinkingStep(state, 'Checking upcoming bills');
    expect(state).toEqual({
      steps: [THINKING_START],
      current: 'Checking upcoming bills'
    });

    state = pushThinkingStep(state, 'Reviewing your spending');
    expect(state).toEqual({
      steps: [THINKING_START, 'Checking upcoming bills'],
      current: 'Reviewing your spending'
    });
  });

  it('ignores empty and consecutive duplicate steps', () => {
    const state = pushThinkingStep(initialThinking(), 'Checking your loans');
    expect(pushThinkingStep(state, '')).toBe(state);
    expect(pushThinkingStep(state, '   ')).toBe(state);
    expect(pushThinkingStep(state, 'Checking your loans')).toBe(state);
  });

  it('caps completed history at three and never duplicates the current step', () => {
    let state = initialThinking();
    for (const next of ['A step', 'B step', 'C step', 'D step', 'E step']) {
      state = pushThinkingStep(state, next);
    }

    expect(state.steps).toEqual(['B step', 'C step', 'D step']);
    expect(state.current).toBe('E step');
    expect(state.steps).not.toContain(state.current);
  });
});
