import React from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';

export function Controls({ playing, onPlayPause, onNext, onPrev }) {
    return (
        <div className="controls" style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem',
            padding: '1rem', background: 'var(--bg-primary)',
            borderTop: '1px solid rgba(0,0,0,0.1)'
        }}>
            <button onClick={onPrev} style={{ background: 'transparent', color: 'var(--text-primary)' }}>
                <SkipBack />
            </button>

            <button
                onClick={onPlayPause}
                style={{
                    width: '50px', height: '50px', borderRadius: '50%',
                    background: 'var(--accent-color)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
            >
                {playing ? <Pause /> : <Play />}
            </button>

            <button onClick={onNext} style={{ background: 'transparent', color: 'var(--text-primary)' }}>
                <SkipForward />
            </button>
        </div>
    );
}
