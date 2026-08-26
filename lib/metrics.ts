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

  const [conversations30d, appointmentsThisWeek, appointmentsToday, pausedBots] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId)
        .gte("last_message_at", daysAgo(30).toISOString()),
      supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId)
        .neq("status", "cancelada")
        .gte("starts_at", week.from.toISOString())
        .lt("starts_at", week.to.toISOString()),
      supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId)
        .neq("status", "cancelada")
        .gte("starts_at", today.from.toISOString())
        .lt("starts_at", today.to.toISOString()),
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("bot_active", false),
    ]);

  for (const result of [
    conversations30d,
    appointmentsThisWeek,
    appointmentsToday,
    pausedBots,
  ]) {
    if (result.error) throw result.error;
  }

  return {
    conversations30d: conversations30d.count ?? 0,
    appointmentsThisWeek: appointmentsThisWeek.count ?? 0,
    appointmentsToday: appointmentsToday.count ?? 0,
    pausedBots: pausedBots.count ?? 0,
  };
}
