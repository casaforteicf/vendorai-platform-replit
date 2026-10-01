export type ParallelMissionInput<T> = {
  id: string;
  payload: T;
};

export type ParallelMissionResult<R> = {
  id: string;
  ok: boolean;
  result?: R;
  error?: string;
};

export async function runParallelMissions<T, R>(
  missions: ParallelMissionInput<T>[],
  execute: (mission: ParallelMissionInput<T>) => Promise<R>,
  concurrency = 4,
): Promise<ParallelMissionResult<R>[]> {
  const limit = Math.min(Math.max(concurrency, 1), 12);
  const results = new Array<ParallelMissionResult<R>>(missions.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= missions.length) return;
      const mission = missions[index]!;
      try {
        results[index] = { id: mission.id, ok: true, result: await execute(mission) };
      } catch (error: any) {
        results[index] = {
          id: mission.id,
          ok: false,
          error: error?.message ?? "MISSION_FAILED",
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, missions.length) }, () => worker()));
  return results;
}
