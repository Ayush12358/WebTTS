import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

export function PDFPageView({ pdfData, pageIndex, onLoaded }) {
    const canvasRef = useRef(null);
    const textLayerRef = useRef(null);
    const [page, setPage] = useState(null);
    const [viewport, setViewport] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const loadPage = async () => {
            try {
                // We load the document and the specific page
                const pdf = await pdfjsLib.getDocument(pdfData.slice()).promise;
                if (!active) return;
                const p = await pdf.getPage(pageIndex);
                if (!active) return;
                setPage(p);

                // Calculate scale to fit container width, or just use 1.5 for crispness
                // In a real app we'd measure the container, here we just use a fixed max width scaling
                const containerWidth = Math.min(window.innerWidth - 32, 800);
                const unscaled = p.getViewport({ scale: 1.0 });
                const scale = containerWidth / unscaled.width;

                const vp = p.getViewport({ scale });
                setViewport(vp);
            } catch (err) {
                console.error("Error rendering PDF page", err);
            }
        };
        loadPage();
        return () => { active = false; };
    }, [pdfData, pageIndex]);

    useEffect(() => {
        let active = true;
        if (!page || !viewport || !canvasRef.current || !textLayerRef.current) return;

        const renderPage = async () => {
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d', { alpha: false });

            // Adjust for high DPI displays
            const outputScale = window.devicePixelRatio || 1;
            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            canvas.style.width = Math.floor(viewport.width) + "px";
            canvas.style.height = Math.floor(viewport.height) + "px";

            const transform = outputScale !== 1
                ? [outputScale, 0, 0, outputScale, 0, 0]
                : null;

            const renderContext = {
                canvasContext: context,
                transform: transform,
                viewport: viewport
            };

            try {
                await page.render(renderContext).promise;
                if (!active) return;

                // Now render text layer
                const textContent = await page.getTextContent();
                if (!active) return;

                const textLayerDiv = textLayerRef.current;
                textLayerDiv.innerHTML = ''; // Clear previous
                textLayerDiv.style.left = canvas.offsetLeft + 'px';
                textLayerDiv.style.top = canvas.offsetTop + 'px';
                textLayerDiv.style.height = canvas.style.height;
                textLayerDiv.style.width = canvas.style.width;

                pdfjsLib.renderTextLayer({
                    textContentSource: textContent,
                    container: textLayerDiv,
                    viewport: viewport,
                    textDivs: []
                }).then(() => {
                    // Once rendered, we need to mark these as TTS speakable
                    const spans = textLayerDiv.querySelectorAll('span');
                    let wordIndex = 0;
                    spans.forEach(span => {
                        const text = span.innerText.trim();
                        // Only make chunks with actual words speakable
                        if (text && text.length > 0 && !/^[\s]+$/.test(text)) {
                            span.classList.add('tts-speakable');
                            span.setAttribute('data-tts-index', wordIndex++);

                            // Adjust styling so we can see the highlight
                            span.style.color = 'transparent'; // keep original color hidden, we rely on canvas
                            span.style.cursor = 'pointer';
                            span.style.borderRadius = '2px';
                        }
                    });

                    setLoading(false);
                    if (onLoaded) onLoaded();
                });

            } catch (err) {
                if (err.name !== 'RenderingCancelledException') {
                    console.error('Error in PDF render:', err);
                }
            }
        };

        renderPage();
        return () => { active = false; };
    }, [page, viewport, onLoaded]);

    return (
        <div style={{ position: 'relative', margin: '0 auto', width: 'fit-content' }}>
            {loading && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px' }}>Rendering Page...</div>}
            <canvas ref={canvasRef} style={{ display: 'block', margin: '0 auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
            <div
                ref={textLayerRef}
                className="textLayer"
                style={{
                    position: 'absolute',
                    overflow: 'hidden',
                    opacity: 1,
                    lineHeight: 1.0,
                    whiteSpace: 'pre'
                }}
            />
            <style>{`
                /* PDF Text Layer Styles */
                .textLayer {
                    position: absolute;
                    left: 0;
                    top: 0;
                    right: 0;
                    bottom: 0;
                    overflow: hidden;
                    opacity: 1; /* Keep opacity 1 so we can see highlighting */
                    line-height: 1.0;
                }
                .textLayer > span {
                    color: transparent;
                    position: absolute;
                    white-space: pre;
                    cursor: pointer;
                    transform-origin: 0% 0%;
                }
                /* When highlighted by TTS, give it a semi-transparent yellow background */
                .textLayer .tts-active {
                    background-color: rgba(255, 235, 59, 0.4) !important;
                    outline: none !important;
                    box-shadow: none !important;
                    border-radius: 2px;
                }
            `}</style>
        </div>
    );
}
