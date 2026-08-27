import { createClient } from "@/lib/supabase/server";
import { getActiveBusinessId } from "@/lib/business";
import { daysAgo, todayRange, weekRange } from "@/lib/dates";

export type DashboardMetrics = {
  conversations30d: number;
  appointmentsThisWeek: number;
  appointmentsToday: number;
  pausedBots: number;
};

const EMPTY_METRICS: DashboardMetrics = {
  conversations30d: 0,
  appointmentsThisWeek: 0,
  appointmentsToday: 0,
  pausedBots: 0,
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return EMPTY_METRICS;

  const supabase = await createClient();
  const today = todayRange();
  const week = weekRange();

  // Los cuatro recuentos se resuelven en una sola llamada: antes eran cuatro
  // consultas independientes, cada una con su viaje de red.
  const { data, error } = await supabase.rpc("dashboard_metrics", {
    p_business_id: businessId,
    p_since: daysAgo(30).toISOString(),
    p_week_from: week.from.toISOString(),
    p_week_to: week.to.toISOString(),
    p_today_from: today.from.toISOString(),
    p_today_to: today.to.toISOString(),
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return EMPTY_METRICS;

  return {
    conversations30d: Number(row.conversations_30d ?? 0),
    appointmentsThisWeek: Number(row.appointments_this_week ?? 0),
    appointmentsToday: Number(row.appointments_today ?? 0),
    pausedBots: Number(row.paused_bots ?? 0),
  };
}
