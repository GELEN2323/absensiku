import type { PatrolCheckpoint, Position } from '@/lib/types';

export type PatrolMapProps = {
  checkpoints: PatrolCheckpoint[];
  selectedId: string | null;
  onSelect: (checkpoint: PatrolCheckpoint) => void;
  userPosition?: Position | null;
};
