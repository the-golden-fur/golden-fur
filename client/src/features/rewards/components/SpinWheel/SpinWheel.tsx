import { useEffect, useRef, useState } from 'react';
import type { SpinWheelReward } from '../../rewards.types';
import styles from './SpinWheel.module.css';

const COLORS = [
  '#f4a259',
  '#5b8c5a',
  '#5c80bc',
  '#e07a5f',
  '#8a6fdf',
  '#e6c229',
  '#3aafa9',
];

interface Segment {
  reward: SpinWheelReward;
  startAngle: number;
  endAngle: number;
  color: string;
}

function buildSegments(rewards: SpinWheelReward[]): Segment[] {
  let angle = 0;
  return rewards.map((reward, index) => {
    const sweep = (reward.rarity_percent / 100) * 360;
    const segment: Segment = {
      reward,
      startAngle: angle,
      endAngle: angle + sweep,
      color: COLORS[index % COLORS.length],
    };
    angle += sweep;
    return segment;
  });
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

interface SpinWheelProps {
  rewards: SpinWheelReward[];
  /** The already-server-decided winning reward id, or null before a spin
   * result is known. The wheel's landing spot always renders THIS result -
   * it never picks its own outcome. */
  resultRewardId: string | null;
  onAnimationComplete?: () => void;
}

const BASE_SPINS = 6;
const SIZE = 260;

/**
 * Coupon spin wheel (session 86) - a hand-rolled SVG pie-slice wheel sized
 * by each reward's rarity_percent, since no animation library is in this
 * project's dependency tree (kept that way deliberately - see the session
 * plan). Spinning is a pure CSS transform/transition; the actual outcome
 * always comes from the server's spin_wheel() RPC result, passed in as
 * resultRewardId.
 */
export function SpinWheel({
  rewards,
  resultRewardId,
  onAnimationComplete,
}: SpinWheelProps) {
  const segments = buildSegments(rewards);
  const [rotation, setRotation] = useState(0);
  const spinningRef = useRef(false);

  useEffect(() => {
    if (!resultRewardId || spinningRef.current) return;

    const segment = segments.find((s) => s.reward.id === resultRewardId);
    if (!segment) return;

    const segmentMidAngle = (segment.startAngle + segment.endAngle) / 2;
    // The pointer is fixed at the top (0deg) - rotate the wheel so the
    // winning segment's middle lands there, plus extra full spins for a
    // convincing animation.
    const targetRotation = BASE_SPINS * 360 + (360 - segmentMidAngle);

    spinningRef.current = true;
    setRotation((previous) => previous + targetRotation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultRewardId]);

  const handleTransitionEnd = () => {
    if (!spinningRef.current) return;
    spinningRef.current = false;
    onAnimationComplete?.();
  };

  const radius = SIZE / 2;

  return (
    <div className={styles.wrapper}>
      <div className={styles.pointer} aria-hidden="true" />
      <div
        className={styles.wheel}
        style={{ transform: `rotate(${rotation}deg)` }}
        onTransitionEnd={handleTransitionEnd}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {segments.map((segment) => (
            <path
              key={segment.reward.id}
              d={arcPath(
                radius,
                radius,
                radius - 4,
                segment.startAngle,
                segment.endAngle
              )}
              fill={segment.color}
              stroke="#fff"
              strokeWidth={2}
            />
          ))}
        </svg>
      </div>

      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li key={segment.reward.id} className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ backgroundColor: segment.color }}
              aria-hidden="true"
            />
            {segment.reward.label} ({segment.reward.rarity_percent}%)
          </li>
        ))}
      </ul>
    </div>
  );
}
