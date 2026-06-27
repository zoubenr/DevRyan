import React from 'react';
import { cn } from '@/lib/utils';

const SEGMENT_REGEX = /(\d+)/;

type Segment = { type: 'text'; value: string } | { type: 'number'; value: string };

const splitLabel = (label: string): Segment[] => {
    const parts = label.split(SEGMENT_REGEX);
    const segments: Segment[] = [];
    for (const part of parts) {
        if (part.length === 0) continue;
        if (SEGMENT_REGEX.test(part)) {
            segments.push({ type: 'number', value: part });
        } else {
            segments.push({ type: 'text', value: part });
        }
    }
    return segments;
};

const DIGIT_STYLE: React.CSSProperties = {
    display: 'inline-block',
    width: '1ch',
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
    verticalAlign: 'baseline',
};

const CSSDigit: React.FC<{ digit: string }> = ({ digit }) => {
    const prevRef = React.useRef(digit);
    const [displayDigit, setDisplayDigit] = React.useState(digit);
    const [fading, setFading] = React.useState(false);

    React.useEffect(() => {
        if (digit === prevRef.current) return;
        prevRef.current = digit;

        setFading(true);

        const timer = setTimeout(() => {
            setDisplayDigit(digit);
            setFading(false);
        }, 100);

        return () => clearTimeout(timer);
    }, [digit]);

    return (
        <span
            style={{
                ...DIGIT_STYLE,
                opacity: fading ? 0 : 1,
                transition: 'opacity 100ms ease',
            }}
        >
            {displayDigit}
        </span>
    );
};

const AnimatedNumber: React.FC<{ value: string; segmentIndex: number }> = ({ value, segmentIndex }) => {
    const digits = value.split('');
    const digitCount = digits.length;

    return (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {digits.map((digit, i) => {
                const posFromRight = digitCount - 1 - i;
                return (
                    <CSSDigit
                        key={`seg${segmentIndex}-pos${posFromRight}`}
                        digit={digit}
                    />
                );
            })}
        </span>
    );
};

const prefersReducedMotion = (): boolean => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
};

interface AnimatedCounterProps {
    label: string;
    animate?: boolean;
    className?: string;
    style?: React.CSSProperties;
    title?: string;
}

const AnimatedCounterInner: React.FC<AnimatedCounterProps> = ({
    label,
    animate = false,
    className,
    style,
    title,
}) => {
    const segments = React.useMemo(() => splitLabel(label), [label]);
    const reduced = prefersReducedMotion();

    if (!animate || reduced) {
        return (
            <span className={cn('inline-flex items-center', className)} style={style} title={title}>
                {label}
            </span>
        );
    }

    return (
        <span className={cn('inline-flex items-center', className)} style={style} title={title}>
            <span className="whitespace-pre">
                {segments.map((seg, i) =>
                    seg.type === 'number' ? (
                        <AnimatedNumber key={`num-${i}`} value={seg.value} segmentIndex={i} />
                    ) : (
                        <span key={`txt-${i}`}>{seg.value}</span>
                    )
                )}
            </span>
        </span>
    );
};

export const AnimatedCounter = React.memo(AnimatedCounterInner, (prev, next) => {
    return prev.label === next.label
        && prev.animate === next.animate
        && prev.className === next.className
        && prev.title === next.title;
});
