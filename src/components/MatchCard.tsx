import { getAdaptiveBattleMode } from '../lib/elo';
import { getCopy } from '../lib/i18n';
import { useAppStore } from '../store/appStore';
import type { Matchup } from '../types';

interface MatchCardProps {
  matchup: Matchup;
  onSubmit: (leftScore: number) => void;
}

export function MatchCard({ matchup, onSubmit }: MatchCardProps) {
  const copy = getCopy(useAppStore((state) => state.locale));
  const mode = getAdaptiveBattleMode(matchup.gap);
  const scaleChoices = [
    { label: copy.match.choices[0], score: 1 },
    { label: copy.match.choices[1], score: 0.75 },
    { label: copy.match.choices[2], score: 0.5 },
    { label: copy.match.choices[3], score: 0.25 },
    { label: copy.match.choices[4], score: 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {[matchup.left, matchup.right].map((song, index) => {
          const rating = index === 0 ? matchup.leftRating : matchup.rightRating;
          return (
            <article key={song.id} className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
              <img src={song.imageUrl} alt={song.title} className="h-64 w-full rounded-[1.5rem] object-cover" />
              <div className="mt-5 space-y-3">
                <div>
                  <h3 className="text-2xl font-semibold text-white">{song.title}</h3>
                  <p className="text-slate-300">{song.artist}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-slate-300">
                  <span className="rounded-full bg-white/10 px-3 py-1">{copy.match.tier} {song.tier}</span>
                  <span className="rounded-full bg-white/10 px-3 py-1">{copy.match.elo} {rating.rating}</span>
                  <span className="rounded-full bg-white/10 px-3 py-1">{rating.matchesPlayed} {copy.match.matches}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="rounded-[2rem] border border-brand-400/30 bg-brand-500/10 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-white">{copy.match.battleControls}</h3>
            <p className="text-sm text-brand-100/90">
              {copy.match.currentGap} {Math.round(matchup.gap)} → {mode === 'binary' ? copy.match.winLoseMode : copy.match.nuanceMode}.
            </p>
          </div>
          {mode === 'binary' ? (
            <div className="flex gap-3">
              <button type="button" onClick={() => onSubmit(1)} className="rounded-full bg-white px-5 py-3 font-medium text-slate-950">
                {copy.match.leftWins}
              </button>
              <button type="button" onClick={() => onSubmit(0)} className="rounded-full border border-white/20 px-5 py-3 font-medium text-white">
                {copy.match.rightWins}
              </button>
            </div>
          ) : (
            <div className="grid w-full gap-3 md:grid-cols-5">
              {scaleChoices.map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  onClick={() => onSubmit(choice.score)}
                  className="rounded-2xl border border-white/15 bg-slate-950/30 px-4 py-3 text-sm font-medium text-white transition hover:border-brand-300 hover:bg-brand-500/20"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
