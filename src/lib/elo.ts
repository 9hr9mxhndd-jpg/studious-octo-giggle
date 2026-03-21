import type { Matchup, RatingRecord, Song, Tier } from '../types';

export const INITIAL_RATING_BY_TIER: Record<Tier, number> = {
  1: 1829,
  2: 1605,
  3: 1365,
};

const GAP_THRESHOLD = 150;
const COOLDOWN_ROUNDS = 20;

export function getInitialRatingForTier(tier: Tier): number {
  return INITIAL_RATING_BY_TIER[tier];
}

export function getKFactor(matchesPlayed: number, isBoundarySong: boolean): number {
  if (isBoundarySong) return 60;
  if (matchesPlayed <= 15) return 48;
  if (matchesPlayed <= 40) return 24;
  return 12;
}

export function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

export function outcomeFromScale(
  selection: 'crushing' | 'win' | 'tie' | 'lose' | 'crushed',
  isLeft: boolean,
): number {
  const leftOutcomeMap = { crushing: 1, win: 0.7, tie: 0.5, lose: 0.3, crushed: 0 } as const;
  const leftScore = leftOutcomeMap[selection];
  return isLeft ? leftScore : 1 - leftScore;
}

export function resolveMatchResult(
  matchup: Matchup,
  leftScore: number,
): { left: RatingRecord; right: RatingRecord } {
  const leftExpected = expectedScore(matchup.leftRating.rating, matchup.rightRating.rating);
  const isBoundary = matchup.left.uncertain || matchup.right.uncertain;
  const leftK = getKFactor(matchup.leftRating.matchesPlayed + 1, isBoundary);
  const rightK = getKFactor(matchup.rightRating.matchesPlayed + 1, isBoundary);
  const leftDelta = leftK * (leftScore - leftExpected);
  const rightDelta = rightK * (1 - leftScore - (1 - leftExpected));
  return {
    left: {
      ...matchup.leftRating,
      rating: Math.round((matchup.leftRating.rating + leftDelta) * 100) / 100,
      matchesPlayed: matchup.leftRating.matchesPlayed + 1,
      lastDelta: Math.round(leftDelta * 100) / 100,
    },
    right: {
      ...matchup.rightRating,
      rating: Math.round((matchup.rightRating.rating + rightDelta) * 100) / 100,
      matchesPlayed: matchup.rightRating.matchesPlayed + 1,
      lastDelta: Math.round(rightDelta * 100) / 100,
    },
  };
}

export function getAdaptiveBattleMode(gap: number): 'binary' | 'scale' {
  return gap >= GAP_THRESHOLD ? 'binary' : 'scale';
}

interface PairScore {
  left: Song;
  right: Song;
  leftRating: RatingRecord;
  rightRating: RatingRecord;
  gap: number;
  score: number;
}

function dynamicTopK(n: number): number {
  return Math.max(10, Math.min(80, Math.round(Math.sqrt(n) * 2)));
}

export function buildMatchup(
  songs: Song[],
  ratings: Record<string, RatingRecord>,
  totalMatchesPlayed = 0,
  lastMatchedAt: Record<string, number> = {},
): Matchup | undefined {
  const tiered = songs.filter((s) => s.tier !== undefined);
  if (tiered.length < 2) return undefined;

  const n = tiered.length;
  const topK = dynamicTopK(n);
  const pairs: PairScore[] = [];

  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const left = tiered[i];
      const right = tiered[j];
      const lr = ratings[left.id];
      const rr = ratings[right.id];
      if (!lr || !rr) continue;

      const pairKey = [left.id, right.id].sort().join('|');
      const elapsed = totalMatchesPlayed - (lastMatchedAt[pairKey] ?? -9999);
      const wCool = elapsed < COOLDOWN_ROUNDS ? 0 : Math.min(1, (elapsed - COOLDOWN_ROUNDS) / COOLDOWN_ROUNDS);
      const wElo = 1 / (1 + Math.abs(lr.rating - rr.rating) / 150);
      const wHunger = 1 / (1 + Math.min(lr.matchesPlayed, rr.matchesPlayed));
      const score = wElo * wCool * wHunger;

      pairs.push({ left, right, leftRating: lr, rightRating: rr, gap: Math.abs(lr.rating - rr.rating), score });
    }
  }

  if (pairs.length === 0) return undefined;

  pairs.sort((a, b) => b.score - a.score);
  const eligible = pairs.filter((p) => p.score > 0);
  const pool = (eligible.length >= topK ? eligible : pairs).slice(0, topK);

  const totalWeight = pool.reduce((s, p) => s + p.score, 0);
  let r = Math.random() * (totalWeight || 1);
  let chosen = pool[pool.length - 1];
  for (const p of pool) {
    r -= p.score;
    if (r <= 0) { chosen = p; break; }
  }

  return {
    left: chosen.left,
    right: chosen.right,
    leftRating: chosen.leftRating,
    rightRating: chosen.rightRating,
    gap: chosen.gap,
    sameTier: chosen.left.tier === chosen.right.tier,
  };
}

export function convergenceFromMatches(matchesPlayed: number): { label: string; value: number } {
  const value = Math.min(100, Math.round((matchesPlayed / 40) * 100));
  const label = value >= 80 ? 'Stable' : value >= 45 ? 'Settling' : 'Learning';
  return { label, value };
}
