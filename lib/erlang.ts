// lib/erlang.ts
// Erlang C staffing calculation — ported from the desktop app's ForecastView.cpp
// Used to determine required agents from call volume and talk time data
//
// Original C++ used global Call_Time_Mean and Call_Time_Std arrays
// This port is pure TypeScript with no MFC dependencies

/**
 * Erlang C formula — probability that a call will wait
 * @param agents  Number of agents
 * @param traffic Traffic intensity (Erlangs) = call_rate * avg_handle_time
 */
export function erlangC(agents: number, traffic: number): number {
  if (agents <= 0 || traffic <= 0) return 0;
  if (traffic >= agents) return 1; // overloaded

  // Calculate A^N / N! part
  let erlangB = 1.0;
  for (let i = 1; i <= agents; i++) {
    erlangB = (traffic * erlangB) / (i + traffic * erlangB);
  }

  const pc = (agents * erlangB) / (agents - traffic * (1 - erlangB));
  return Math.min(Math.max(pc, 0), 1);
}

/**
 * Calculate required agents to meet a service level target using Erlang C
 * @param callRate         Calls per interval (15-min quarter)
 * @param avgHandleTimeSec Average handle time in seconds
 * @param serviceLevel     Target service level as fraction (e.g. 0.80 for 80%)
 * @param targetAnswerSec  Target answer time in seconds (e.g. 20)
 * @param efficiency       Agent occupancy/efficiency % (e.g. 85)
 * @returns Required number of agents
 */
export function requiredAgents(
  callRate: number,
  avgHandleTimeSec: number,
  serviceLevel: number = 0.80,
  targetAnswerSec: number = 20,
  efficiency: number = 85
): number {
  if (callRate <= 0 || avgHandleTimeSec <= 0) return 0;

  // Interval is 15 minutes = 900 seconds
  const intervalSec = 900;

  // Traffic intensity in Erlangs
  const traffic = (callRate * avgHandleTimeSec) / intervalSec;

  // Adjust for efficiency
  const effTraffic = traffic / (efficiency / 100);

  // Start with minimum agents (ceiling of traffic)
  let n = Math.ceil(effTraffic) + 1;

  // Increase agents until service level is met
  for (let attempts = 0; attempts < 200; attempts++) {
    const pc = erlangC(n, effTraffic);
    // P(wait <= T) = 1 - Pc * e^(-(N-A)*T/AHT)
    const exponent = -(n - effTraffic) * (targetAnswerSec / avgHandleTimeSec);
    const sl = 1 - pc * Math.exp(exponent);

    if (sl >= serviceLevel) break;
    n++;
  }

  return n;
}

/**
 * Calculate staffing for an entire forecast week
 * Returns a 7×24×4 array of required agents
 */
export interface ForecastSlot {
  day:              number; // 0-6
  hour:             number; // 0-23
  quarter:          number; // 0-3
  ave_calls:        number;
  ave_calls_adj:    number;
  ave_talk_time:    number;
  ave_talk_time_adj:number;
  ave_agent_adj:    number; // manual override if set
  operators?:       string;
}

export interface StaffingResult {
  day:      number;
  hour:     number;
  quarter:  number;
  required: number; // calculated required agents
  actual:   number; // from ave_agent_adj if set, else required
}

export function calculateWeeklyStaffing(
  slots: ForecastSlot[],
  useErlangC: boolean,
  serviceLevel: number,
  targetAnswerSec: number,
  efficiency: number
): StaffingResult[] {
  return slots.map(slot => {
    // Use adjusted values if available, fall back to raw
    const calls    = slot.ave_calls_adj    > 0 ? slot.ave_calls_adj    : slot.ave_calls;
    const talkTime = slot.ave_talk_time_adj > 0 ? slot.ave_talk_time_adj : slot.ave_talk_time;

    let required = 0;
    if (calls > 0 && talkTime > 0) {
      if (useErlangC) {
        required = requiredAgents(calls, talkTime, serviceLevel, targetAnswerSec, efficiency);
      } else {
        // Simple linear staffing: agents = (calls * handle_time) / interval_seconds
        required = Math.ceil((calls * talkTime) / 900);
      }
    }

    // Manual agent override takes precedence
    const actual = slot.ave_agent_adj > 0 ? slot.ave_agent_adj : required;

    return { day: slot.day, hour: slot.hour, quarter: slot.quarter, required, actual };
  });
}
