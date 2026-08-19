import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

const viewer = document.getElementById('pdfViewer');

if (viewer) {
    const pdfUrl = viewer.dataset.pdfUrl || '';
    const pagesContainer = document.getElementById('pdfPages');
    const loading = document.getElementById('pdfLoading');
    const error = document.getElementById('pdfError');
    const pageIndicator = document.getElementById('pdfPageIndicator');
    const zoomOutButton = document.getElementById('pdfZoomOut');
    const zoomFitButton = document.getElementById('pdfZoomFit');
    const zoomInButton = document.getElementById('pdfZoomIn');
    const fitModeButton = document.getElementById('pdfFitMode');
    const rotateButton = document.getElementById('pdfRotate');
    const zoomIndicator = document.getElementById('pdfZoomIndicator');

    let pdfDocument = null;
    let loadingTask = null;
    let renderTask = null;
    let activePage = null;
    let activeCanvas = null;
    let currentPage = 1;
    let zoom = 1;
    let rotation = 0;
    let fitMode = 'page';
    let renderGeneration = 0;
    let resizeTimer = 0;
    let touchStart = null;

    const minimumZoom = 1;
    const maximumZoom = 4;
    const clamp = (value, minimum, maximum) =>
        Math.min(maximum, Math.max(minimum, value));

    const nextFrame = () => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });

    const isTabletViewport = () => Math.min(window.innerWidth, window.innerHeight) >= 700;

    function updateToolbar() {
        const pageCount = pdfDocument?.numPages || 0;
        pageIndicator.textContent = `${currentPage} / ${pageCount || 1}`;
        zoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
        zoomOutButton.disabled = zoom <= minimumZoom + 0.001;
        zoomInButton.disabled = zoom >= maximumZoom;
        fitModeButton.textContent = fitMode === 'page' ? 'Page' : 'Width';
        fitModeButton.setAttribute(
            'aria-label',
            fitMode === 'page' ? 'Fit PDF to screen width' : 'Fit whole PDF page',
        );
        fitModeButton.title = fitMode === 'page' ? 'Fit width' : 'Fit page';
        viewer.classList.toggle('is-zoomed', zoom > minimumZoom + 0.001);
        viewer.classList.toggle('is-fit-width', fitMode === 'width');
    }

    function releaseCanvas() {
        if (activeCanvas) {
            // Removing a canvas does not immediately release its IOSurface in
            // Safari. Shrinking it first returns the bitmap memory promptly.
            activeCanvas.width = 1;
            activeCanvas.height = 1;
            activeCanvas.remove();
            activeCanvas = null;
        }
        pagesContainer.replaceChildren();
    }

    function releasePage() {
        if (renderTask) {
            try {
                renderTask.cancel();
            } catch {
                // The render may already have completed.
            }
            renderTask = null;
        }
        if (activePage) {
            try {
                activePage.cleanup();
            } catch {
                // PDF.js may already have released this page.
            }
            activePage = null;
        }
        releaseCanvas();
    }

    function showLoading() {
        loading.hidden = false;
        error.hidden = true;
        pagesContainer.setAttribute('aria-busy', 'true');
    }

    function showError(renderError) {
        console.error('Unable to render linked scaffold PDF:', renderError);
        loading.hidden = true;
        error.hidden = false;
        pagesContainer.setAttribute('aria-busy', 'false');
    }

    function getRenderScale(cssViewport) {
        // Engineering PDFs can contain extremely dense vectors and large 3D
        // images. A modest display bitmap is much faster and safer on Safari;
        // the user can still zoom and request a new bitmap for the visible page.
        const tablet = isTabletViewport();
        const pixelBudget = tablet ? 3_000_000 : 1_600_000;
        const maximumOutputScale = tablet ? 1.5 : 1.35;
        let outputScale = Math.min(window.devicePixelRatio || 1, maximumOutputScale);
        const requestedPixels =
            cssViewport.width * outputScale * cssViewport.height * outputScale;
        if (requestedPixels > pixelBudget) {
            outputScale *= Math.sqrt(pixelBudget / requestedPixels);
        }
        const dimensionLimit = Math.min(
            4096 / Math.max(1, cssViewport.width),
            4096 / Math.max(1, cssViewport.height),
        );
        return Math.max(0.75, Math.min(outputScale, dimensionLimit));
    }

    async function renderPage(pageNumber) {
        if (!pdfDocument) return;

        const boundedPage = clamp(pageNumber, 1, pdfDocument.numPages);
        const generation = ++renderGeneration;
        currentPage = boundedPage;
        updateToolbar();
        showLoading();
        releasePage();

        // Give Safari two frames to release the previous canvas before a new
        // vector display list and bitmap are allocated.
        await nextFrame();
        if (generation !== renderGeneration) return;

        let page = null;
        try {
            page = await pdfDocument.getPage(boundedPage);
            if (generation !== renderGeneration) {
                page.cleanup();
                return;
            }
            activePage = page;

            const effectiveRotation = (page.rotate + rotation + 360) % 360;
            const unitViewport = page.getViewport({scale: 1, rotation: effectiveRotation});
            const tablet = viewer.clientWidth >= 700;
            const horizontalPadding = tablet ? 44 : 24;
            const verticalPadding = tablet ? 136 : 112;
            const availableWidth = Math.max(220, viewer.clientWidth - horizontalPadding);
            const availableHeight = Math.max(220, viewer.clientHeight - verticalPadding);
            const fittedScale = fitMode === 'width'
                ? availableWidth / unitViewport.width
                : Math.min(
                    availableWidth / unitViewport.width,
                    availableHeight / unitViewport.height,
                );
            const cssViewport = page.getViewport({
                scale: fittedScale * zoom,
                rotation: effectiveRotation,
            });
            const outputScale = getRenderScale(cssViewport);
            const renderViewport = page.getViewport({
                scale: fittedScale * zoom * outputScale,
                rotation: effectiveRotation,
            });

            const slot = document.createElement('section');
            slot.className = 'pdf-page-slot is-current-page';
            slot.dataset.pageNumber = String(boundedPage);
            slot.setAttribute('aria-label', `Page ${boundedPage} of ${pdfDocument.numPages}`);
            slot.style.width = `${Math.max(viewer.clientWidth, Math.ceil(cssViewport.width + horizontalPadding))}px`;
            slot.style.height = `${Math.max(viewer.clientHeight, Math.ceil(cssViewport.height + verticalPadding))}px`;

            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page';
            canvas.width = Math.max(1, Math.floor(renderViewport.width));
            canvas.height = Math.max(1, Math.floor(renderViewport.height));
            canvas.style.width = `${Math.max(1, Math.floor(cssViewport.width))}px`;
            canvas.style.height = `${Math.max(1, Math.floor(cssViewport.height))}px`;
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', `Rendered PDF page ${boundedPage}`);
            slot.appendChild(canvas);
            pagesContainer.appendChild(slot);
            activeCanvas = canvas;

            const context = canvas.getContext('2d', {
                alpha: false,
                desynchronized: true,
            });
            if (!context) throw new Error('This browser could not create the PDF canvas.');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);

            renderTask = page.render({
                canvasContext: context,
                viewport: renderViewport,
                background: '#ffffff',
                intent: 'display',
            });
            await renderTask.promise;
            if (generation !== renderGeneration) return;

            renderTask = null;
            viewer.scrollTo({left: 0, top: 0, behavior: 'auto'});
            pagesContainer.setAttribute('aria-busy', 'false');
            loading.hidden = true;

            // Keep only the completed canvas bitmap. Release PDF.js's vector
            // operator list, decoded images, fonts, and other page resources.
            page.cleanup();
            activePage = null;
        } catch (renderError) {
            if (renderError?.name === 'RenderingCancelledException') return;
            if (generation === renderGeneration) showError(renderError);
        } finally {
            if (generation !== renderGeneration && page && page !== activePage) {
                try {
                    page.cleanup();
                } catch {
                    // A newer render already reclaimed the page resources.
                }
            }
        }
    }

    function changePage(offset) {
        if (!pdfDocument) return;
        const nextPage = clamp(currentPage + offset, 1, pdfDocument.numPages);
        if (nextPage !== currentPage) {
            zoom = minimumZoom;
            void renderPage(nextPage);
        }
    }

    function setZoom(nextZoom) {
        const boundedZoom = clamp(nextZoom, minimumZoom, maximumZoom);
        if (Math.abs(boundedZoom - zoom) < 0.001) return;
        zoom = boundedZoom;
        updateToolbar();
        void renderPage(currentPage);
    }

    zoomOutButton.addEventListener('click', () => setZoom(zoom - 0.25));
    zoomFitButton.addEventListener('click', () => setZoom(minimumZoom));
    zoomInButton.addEventListener('click', () => setZoom(zoom + 0.25));
    fitModeButton.addEventListener('click', () => {
        fitMode = fitMode === 'page' ? 'width' : 'page';
        zoom = minimumZoom;
        updateToolbar();
        void renderPage(currentPage);
    });
    rotateButton.addEventListener('click', () => {
        rotation = (rotation + 90) % 360;
        zoom = minimumZoom;
        void renderPage(currentPage);
    });

    viewer.addEventListener('touchstart', event => {
        const browserScale = window.visualViewport?.scale || 1;
        if (
            event.touches.length !== 1
            || browserScale > 1.05
            || zoom > minimumZoom + 0.001
        ) {
            touchStart = null;
            return;
        }
        touchStart = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY,
        };
    }, {passive: true});

    viewer.addEventListener('touchmove', event => {
        if (!touchStart || event.touches.length !== 1) return;
        const dx = event.touches[0].clientX - touchStart.x;
        const dy = event.touches[0].clientY - touchStart.y;
        const atTop = viewer.scrollTop <= 2;
        const atBottom = viewer.scrollTop + viewer.clientHeight >= viewer.scrollHeight - 2;
        const canChangePage = fitMode === 'page' || (dy > 0 ? atTop : atBottom);
        if (
            canChangePage
            && Math.abs(dy) > 12
            && Math.abs(dy) > Math.abs(dx) * 1.2
        ) {
            // At fitted size a vertical gesture means page navigation, not
            // document panning. Suppress Safari's rubber-band overscroll.
            event.preventDefault();
        }
    }, {passive: false});

    viewer.addEventListener('touchend', event => {
        if (!touchStart || event.changedTouches.length !== 1) return;
        const dx = event.changedTouches[0].clientX - touchStart.x;
        const dy = event.changedTouches[0].clientY - touchStart.y;
        touchStart = null;
        if (Math.abs(dy) < 52 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
        const atTop = viewer.scrollTop <= 2;
        const atBottom = viewer.scrollTop + viewer.clientHeight >= viewer.scrollHeight - 2;
        if (fitMode !== 'page' && !(dy > 0 ? atTop : atBottom)) return;
        changePage(dy < 0 ? 1 : -1);
    }, {passive: true});

    viewer.addEventListener('touchcancel', () => {
        touchStart = null;
    }, {passive: true});

    window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            if ((window.visualViewport?.scale || 1) <= 1.05) {
                void renderPage(currentPage);
            }
        }, 220);
    });

    window.addEventListener('pagehide', () => {
        renderGeneration += 1;
        releasePage();
        try {
            pdfDocument?.cleanup();
            loadingTask?.destroy();
        } catch {
            // The document may already be closed by Safari.
        }
    }, {once: true});

    async function openDocument() {
        if (!pdfUrl) throw new Error('No PDF URL was supplied.');
        updateToolbar();
        loadingTask = pdfjsLib.getDocument({
            url: pdfUrl,
            // Range-only loading prevents Safari from downloading and holding
            // the complete drawing when only one page is being viewed.
            disableRange: false,
            disableStream: true,
            disableAutoFetch: true,
            rangeChunkSize: 256 * 1024,
            canvasMaxAreaInBytes: isTabletViewport() ? 32_000_000 : 16_000_000,
            isOffscreenCanvasSupported: typeof OffscreenCanvas !== 'undefined',
            isImageDecoderSupported: false,
            isEvalSupported: false,
            verbosity: 0,
        });
        pdfDocument = await loadingTask.promise;
        updateToolbar();
        await renderPage(1);
    }

    updateToolbar();
    openDocument().catch(showError);
}
