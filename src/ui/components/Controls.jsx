import { Play, Pause, SkipBack, SkipForward, Clock } from 'lucide-react';

export function Controls({ playing, onPlayPause, onNext, onPrev, timeLeft, canPrev = true, canNext = true }) {
    return (
        <div className="reader-controls" style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem',
            padding: '0.25rem 1rem',
            position: 'relative'
        }}>
            <button
                onClick={onPrev}
                disabled={!canPrev}
                className="icon-btn"
                aria-label="Previous sentence"
                style={{ color: 'var(--text-secondary)' }}
            >
                <SkipBack size={20} />
            </button>

            <button
                onClick={onPlayPause}
                aria-label={playing ? 'Pause' : 'Play'}
                style={{
                    width: '44px', height: '44px', borderRadius: '50%',
                    background: 'var(--accent-color)',
                    color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 8px var(--shadow-color)',
                    transition: 'transform 0.1s, box-shadow 0.15s'
                }}
            >
                {playing ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: '2px' }} />}
            </button>

            <button
                onClick={onNext}
                disabled={!canNext}
                className="icon-btn"
                aria-label="Next sentence"
                style={{ color: 'var(--text-secondary)' }}
            >
                <SkipForward size={20} />
            </button>

            {timeLeft && (
                <div className="reader-time-left" style={{
                    position: 'absolute',
                    right: '0.5rem',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                }}>
                    <Clock size={13} /> {timeLeft} left
                </div>
            )}
        </div>
    );
}
