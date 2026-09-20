import React, { useEffect, useState } from 'react';
import AppBar from '../../components/layout/AppBar';
import { Card, EmptyState } from '../../components/react/Feedback';
import StatTile from '../../components/base/StatTile';
import RankedStatRow from '../../components/list/RankedStatRow';
import { usageStatsState } from './usageStatsState';

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export default function UsageStatsDefaultView() {
  const [, setTick] = useState(0);

  useEffect(() => {
    void usageStatsState.load().then(() => {
      setTick((t) => t + 1);
    });
  }, []);

  const stats = usageStatsState.stats;
  const hasUsage = !!stats && stats.top.length > 0;
  const maxCount = stats && stats.top.length ? stats.top[0].count : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppBar title="Usage Stats" />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {hasUsage && stats ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <StatTile label="Total Launches" value={stats.totalLaunches.toLocaleString()} />
              <StatTile
                label="Commands Run"
                value={stats.top.reduce((acc, curr) => acc + curr.count, 0).toLocaleString()}
              />
            </div>

            <Card title="Top Commands">
              <div className="space-y-2">
                {stats.top.map((item, index) => (
                  <RankedStatRow
                    key={item.id}
                    rank={index + 1}
                    title={item.label || item.id}
                    subtitle={item.id}
                    count={item.count}
                    maxCount={maxCount}
                  />
                ))}
              </div>
            </Card>
          </>
        ) : (
          <EmptyState
            message="No Usage Data Yet"
            description="Launch some commands to see your usage statistics here."
          />
        )}
      </div>
    </div>
  );
}
