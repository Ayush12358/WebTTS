/**
 * Reusable loading skeleton placeholder with shimmer animation.
 * @param {{ width?: string, height?: string, style?: object, count?: number, className?: string }} props
 */
export function Skeleton({ width = '100%', height = '1rem', style, count = 1, className }) {
    const items = Array.from({ length: count }, (_, i) => (
        <div
            key={i}
            className={`skeleton-shimmer ${className || ''}`}
            style={{
                width,
                height,
                borderRadius: '4px',
                marginBottom: count > 1 && i < count - 1 ? '0.5rem' : undefined,
                background: 'linear-gradient(90deg, rgba(128,128,128,0.08) 25%, rgba(128,128,128,0.18) 50%, rgba(128,128,128,0.08) 75%)',
                backgroundSize: '200% 100%',
                animation: 'skeleton-loading 1.5s ease-in-out infinite',
                ...style
            }}
        />
    ));

    return count === 1 ? items[0] : <>{items}</>;
}
