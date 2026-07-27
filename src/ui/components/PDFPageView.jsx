import { useEffect, useRef, useState } from 'react';
import { pdfjsLib } from '../../core/pdfjs';
import { splitTextIntoSegments } from '../../core/content';
import { recognizePdfCanvas } from '../../core/ocr';

function createOcrSpans(container, words, outputScale) {
    const fragment = document.createDocumentFragment();
    words.forEach(word => {
        const span = document.createElement('span');
        span.className = 'pdf-ocr-word';
        span.textContent = word.text;
        span.style.left = `${word.x0 / outputScale}px`;
        span.style.top = `${word.y0 / outputScale}px`;
        span.style.width = `${(word.x1 - word.x0) / outputScale}px`;
        span.style.height = `${(word.y1 - word.y0) / outputScale}px`;
        span.style.fontSize = `${Math.max((word.y1 - word.y0) / outputScale, 8)}px`;
        span.style.lineHeight = '1';
        fragment.appendChild(span);
    });
    container.appendChild(fragment);
    return Array.from(container.querySelectorAll('.pdf-ocr-word'));
}

export function PDFPageView({ pdfData, pageIndex, segments = [], empty = false, ocrWords: cachedOcrWords, onLoaded, onOcr, onOcrError }) {
    const canvasRef = useRef(null);
    const textLayerRef = useRef(null);
    const onLoadedRef = useRef(onLoaded);
    const onOcrRef = useRef(onOcr);
    const onOcrErrorRef = useRef(onOcrError);
    const [ocrWords, setOcrWords] = useState(() => (
        Array.isArray(cachedOcrWords) ? cachedOcrWords : []
    ));
    const [ocrStatus, setOcrStatus] = useState('idle');
    const [ocrError, setOcrError] = useState('');
    const [page, setPage] = useState(null);
    const [viewport, setViewport] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        onLoadedRef.current = onLoaded;
        onOcrRef.current = onOcr;
        onOcrErrorRef.current = onOcrError;
    }, [onLoaded, onOcr, onOcrError]);


    useEffect(() => {
        let active = true;

        const loadPage = async () => {
            try {
                const pdf = await pdfjsLib.getDocument(pdfData.slice()).promise;
                if (!active) return;
                const pageProxy = await pdf.getPage(pageIndex);
                if (!active) return;

                const containerWidth = Math.min(window.innerWidth - 32, 800);
                const unscaled = pageProxy.getViewport({ scale: 1 });
                const scale = Math.max(containerWidth / unscaled.width, 0.5);

                setPage(pageProxy);
                setViewport(pageProxy.getViewport({ scale }));
            } catch (err) {
                if (active) {
                    console.error('Error rendering PDF page', err);
                    setLoading(false);
                }
            }
        };

        loadPage();
        return () => { active = false; };
    }, [pdfData, pageIndex]);

    useEffect(() => {
        let active = true;
        let renderTask = null;
        if (!page || !viewport || !canvasRef.current || !textLayerRef.current) return undefined;

        const renderPage = async () => {
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d', { alpha: false });
            const outputScale = window.devicePixelRatio || 1;

            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;

            renderTask = page.render({
                canvasContext: context,
                transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
                viewport
            });

            try {
                await renderTask.promise;
                if (!active) return;

                const textContent = await page.getTextContent();
                if (!active) return;

                const textLayerDiv = textLayerRef.current;
                textLayerDiv.replaceChildren();
                textLayerDiv.style.height = canvas.style.height;
                textLayerDiv.style.width = canvas.style.width;

                const textLayer = new pdfjsLib.TextLayer({
                    textContentSource: textContent,
                    container: textLayerDiv,
                    viewport
                });
                await textLayer.render();
                if (!active) return;

                let spans = Array.from(textLayer.textDivs || textLayerDiv.querySelectorAll('span'))
                    .filter(span => (span.textContent || '').trim());

                if (!spans.length && ocrWords.length) {
                    spans = createOcrSpans(textLayerDiv, ocrWords, outputScale);
                }

                if (!spans.length && empty && !ocrWords.length) {
                    setOcrStatus('running');
                    try {
                        const result = await recognizePdfCanvas(canvas);
                        if (!active) return;
                        setOcrWords(result.words);
                        onOcrRef.current?.(result, pageIndex - 1);
                        setOcrStatus('complete');
                        setLoading(false);
                        return;
                    } catch (err) {
                        if (!active) return;
                        console.error('Error recognizing PDF page', err);
                        setOcrError('Local OCR could not read this page.');
                        onOcrErrorRef.current?.(err);
                    }
                }

                const fallbackSegments = splitTextIntoSegments(spans.map(span => span.textContent || '').join(' '));
                const segmentTexts = segments.length ? segments : fallbackSegments;
                let segmentIndex = 0;
                let group = [];
                let groupText = '';

                const flushGroup = () => {
                    const text = groupText.trim();
                    if (!text || group.length === 0) {
                        group = [];
                        groupText = '';
                        return;
                    }

                    const first = group[0];
                    first.classList.add('tts-speakable');
                    first.setAttribute('data-tts-index', String(segmentIndex));
                    first.setAttribute('data-tts-text', text);
                    group.forEach(span => {
                        span.classList.add('tts-segment-part');
                        span.setAttribute('data-tts-segment-index', String(segmentIndex));
                        span.style.color = 'transparent';
                        span.style.cursor = 'pointer';
                        span.style.borderRadius = '2px';
                    });
                    segmentIndex += 1;
                    group = [];
                    groupText = '';
                };

                spans.forEach(span => {
                    const text = (span.textContent || '').trim();
                    if (!text) return;
                    group.push(span);
                    groupText = groupText ? `${groupText} ${text}` : text;
                    const target = segmentTexts[segmentIndex] || '';
                    if (!target || groupText.length >= target.length || /[.!?。！？]$/.test(text)) {
                        flushGroup();
                    }
                });
                flushGroup();

                setLoading(false);
                onLoadedRef.current?.();
            } catch (err) {
                if (err.name !== 'RenderingCancelledException') {
                    console.error('Error in PDF render:', err);
                    setLoading(false);
                }
            }
        };

        renderPage();
        return () => {
            active = false;
            renderTask?.cancel();
        };
    }, [page, pageIndex, viewport, segments, empty, ocrWords]);

    return (
        <div className="pdf-page-view" style={{ position: 'relative', margin: '0 auto', width: 'fit-content' }}>
            {loading && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', zIndex: 2
                }}>
                    {ocrStatus === 'running' ? 'Reading page locally…' : 'Rendering Page…'}
                </div>
            )}
            {empty && !loading && (
                <div style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                    {ocrError || 'This page has no extractable text. It may be image-only.'}
                </div>
            )}
            <canvas ref={canvasRef} style={{ display: 'block', margin: '0 auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
            <div
                ref={textLayerRef}
                className="textLayer"
                aria-label="PDF text layer"
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    overflow: 'hidden',
                    opacity: 1,
                    lineHeight: 1,
                    whiteSpace: 'pre'
                }}
            />
            <style>{`
                .pdf-page-view .textLayer {
                    position: absolute;
                    overflow: hidden;
                    line-height: 1;
                }
                .pdf-page-view .textLayer > span {
                    color: transparent;
                    position: absolute;
                    white-space: pre;
                    transform-origin: 0% 0%;
                }
                .pdf-page-view .textLayer .pdf-ocr-word {
                    position: absolute;
                    color: transparent;
                    white-space: pre;
                    cursor: pointer;
                }
                .pdf-page-view .textLayer .tts-active {
                    background-color: rgba(255, 235, 59, 0.4) !important;
                    outline: none !important;
                    box-shadow: none !important;
                    border-radius: 2px;
                }
            `}</style>
        </div>
    );
}
