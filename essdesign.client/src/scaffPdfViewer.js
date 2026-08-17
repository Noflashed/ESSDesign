import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

const viewer = document.getElementById('pdfViewer');

if (viewer) {
    const documentUrl = viewer.dataset.pdfUrl || '';
    const pagesElement = document.getElementById('pdfPages');
    const loadingElement = document.getElementById('pdfLoading');
    const errorElement = document.getElementById('pdfError');
    const pageIndicator = document.getElementById('pdfPageIndicator');
    const zoomIndicator = document.getElementById('pdfZoomIndicator');
    const zoomOutButton = document.getElementById('pdfZoomOut');
    const zoomFitButton = document.getElementById('pdfZoomFit');
    const zoomInButton = document.getElementById('pdfZoomIn');

    let pdfDocument = null;
    let zoom = 1;
    let renderGeneration = 0;
    let resizeTimer = 0;
    let scrollFrame = 0;
    let pinchState = null;
    const activeTouchPointers = new Map();

    const clampZoom = value => Math.min(3, Math.max(1, value));

    function getRenderPixelRatio(cssViewport) {
        const deviceRatio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
        const dimensionLimit = Math.min(
            8192 / Math.max(1, cssViewport.width),
            8192 / Math.max(1, cssViewport.height),
        );
        const pixelLimit = Math.sqrt(
            10_000_000 / Math.max(1, cssViewport.width * cssViewport.height),
        );
        return Math.max(1, Math.min(deviceRatio, dimensionLimit, pixelLimit));
    }

    function updateZoomControls() {
        zoomIndicator.textContent = zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`;
        zoomOutButton.disabled = zoom <= 1;
        zoomInButton.disabled = zoom >= 3;
        viewer.classList.toggle('is-zoomed', zoom > 1.001);
    }

    function updateCurrentPage() {
        scrollFrame = 0;
        if (!pdfDocument) return;
        const slots = Array.from(pagesElement.querySelectorAll('.pdf-page-slot'));
        if (slots.length === 0) return;
        const viewerCenter = viewer.scrollTop + (viewer.clientHeight / 2);
        let closestPage = 1;
        let closestDistance = Number.POSITIVE_INFINITY;
        slots.forEach((slot, index) => {
            const slotCenter = slot.offsetTop + (slot.offsetHeight / 2);
            const distance = Math.abs(slotCenter - viewerCenter);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestPage = index + 1;
            }
        });
        pageIndicator.textContent = `${closestPage} / ${pdfDocument.numPages}`;
    }

    async function renderPages({ preservePage = true } = {}) {
        if (!pdfDocument) return;
        const generation = ++renderGeneration;
        const previousPage = preservePage
            ? Number(pageIndicator.textContent.split('/')[0]?.trim()) || 1
            : 1;
        const availableWidth = Math.max(80, viewer.clientWidth - 16);
        const availableHeight = Math.max(120, viewer.clientHeight - 16);

        loadingElement.hidden = false;
        errorElement.hidden = true;
        pagesElement.replaceChildren();
        pagesElement.setAttribute('aria-busy', 'true');

        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
            if (generation !== renderGeneration) return;
            const page = await pdfDocument.getPage(pageNumber);
            const naturalViewport = page.getViewport({ scale: 1 });
            const fitScale = Math.min(
                availableWidth / naturalViewport.width,
                availableHeight / naturalViewport.height,
            );
            const cssScale = fitScale * zoom;
            const cssViewport = page.getViewport({ scale: cssScale });
            const pixelRatio = getRenderPixelRatio(cssViewport);
            const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });

            const slot = document.createElement('section');
            slot.className = 'pdf-page-slot';
            slot.dataset.pageNumber = String(pageNumber);
            slot.setAttribute('aria-label', `Page ${pageNumber} of ${pdfDocument.numPages}`);
            slot.style.width = `${Math.max(viewer.clientWidth, cssViewport.width + 16)}px`;
            slot.style.height = `${Math.max(viewer.clientHeight, cssViewport.height + 16)}px`;

            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page';
            canvas.width = Math.max(1, Math.floor(renderViewport.width));
            canvas.height = Math.max(1, Math.floor(renderViewport.height));
            canvas.style.width = `${cssViewport.width}px`;
            canvas.style.height = `${cssViewport.height}px`;
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', `Rendered PDF page ${pageNumber}`);
            slot.appendChild(canvas);
            pagesElement.appendChild(slot);

            const context = canvas.getContext('2d', { alpha: false });
            await page.render({
                canvasContext: context,
                viewport: renderViewport,
                background: '#ffffff',
            }).promise;
            if (pageNumber === 1) loadingElement.hidden = true;
        }

        if (generation !== renderGeneration) return;
        pagesElement.setAttribute('aria-busy', 'false');
        loadingElement.hidden = true;
        const targetPage = pagesElement.querySelector(`[data-page-number="${Math.min(previousPage, pdfDocument.numPages)}"]`);
        if (targetPage) {
            viewer.scrollTo({ left: 0, top: targetPage.offsetTop, behavior: 'auto' });
        }
        updateCurrentPage();
        updateZoomControls();
    }

    async function setZoom(nextZoom) {
        const normalizedZoom = clampZoom(nextZoom);
        if (normalizedZoom === zoom || !pdfDocument) return;
        zoom = normalizedZoom;
        updateZoomControls();
        await renderPages();
    }

    zoomOutButton.addEventListener('click', () => setZoom(zoom - 0.25));
    zoomFitButton.addEventListener('click', () => setZoom(1));
    zoomInButton.addEventListener('click', () => setZoom(zoom + 0.25));

    viewer.addEventListener('scroll', () => {
        if (scrollFrame) return;
        scrollFrame = window.requestAnimationFrame(updateCurrentPage);
    }, { passive: true });

    const pointerDistance = pointers => Math.hypot(
        pointers[0].x - pointers[1].x,
        pointers[0].y - pointers[1].y,
    );

    function beginPinch() {
        if (pinchState || activeTouchPointers.size !== 2) return;
        const pointers = Array.from(activeTouchPointers.values());
        const startDistance = pointerDistance(pointers);
        if (startDistance <= 0) return;
        const bounds = viewer.getBoundingClientRect();
        const midpointX = ((pointers[0].x + pointers[1].x) / 2) - bounds.left + viewer.scrollLeft;
        const midpointY = ((pointers[0].y + pointers[1].y) / 2) - bounds.top + viewer.scrollTop;
        pinchState = {
            startDistance,
            startZoom: zoom,
            draftZoom: zoom,
        };
        pagesElement.style.transformOrigin = `${midpointX}px ${midpointY}px`;
        pagesElement.style.willChange = 'transform';
        viewer.classList.add('is-pinching');
    }

    function updatePinch() {
        if (!pinchState || activeTouchPointers.size < 2) return;
        const pointers = Array.from(activeTouchPointers.values()).slice(0, 2);
        const distance = pointerDistance(pointers);
        pinchState.draftZoom = clampZoom(
            pinchState.startZoom * (distance / pinchState.startDistance),
        );
        const previewScale = pinchState.draftZoom / pinchState.startZoom;
        pagesElement.style.transform = `scale(${previewScale})`;
        zoomIndicator.textContent = pinchState.draftZoom === 1
            ? 'Fit'
            : `${Math.round(pinchState.draftZoom * 100)}%`;
    }

    function finishPinch() {
        if (!pinchState) return;
        const nextZoom = pinchState.draftZoom;
        pinchState = null;
        viewer.classList.remove('is-pinching');
        pagesElement.style.transform = '';
        pagesElement.style.transformOrigin = '';
        pagesElement.style.willChange = '';
        if (Math.abs(nextZoom - zoom) < 0.02) {
            updateZoomControls();
            return;
        }
        setZoom(nextZoom);
    }

    viewer.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'touch') return;
        activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try { viewer.setPointerCapture(event.pointerId); } catch { /* Safari can decline capture. */ }
        beginPinch();
    });

    viewer.addEventListener('pointermove', event => {
        if (!activeTouchPointers.has(event.pointerId)) return;
        activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (!pinchState) beginPinch();
        if (!pinchState) return;
        event.preventDefault();
        updatePinch();
    }, { passive: false });

    const endTouchPointer = event => {
        activeTouchPointers.delete(event.pointerId);
        if (pinchState && activeTouchPointers.size < 2) finishPinch();
    };
    viewer.addEventListener('pointerup', endTouchPointer);
    viewer.addEventListener('pointercancel', endTouchPointer);

    window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => renderPages(), 180);
    });

    async function loadDocument() {
        if (!documentUrl) throw new Error('No PDF URL was supplied.');
        const loadingTask = pdfjsLib.getDocument({
            url: documentUrl,
            disableAutoFetch: true,
            isEvalSupported: false,
        });
        pdfDocument = await loadingTask.promise;
        pageIndicator.textContent = `1 / ${pdfDocument.numPages}`;
        await renderPages({ preservePage: false });
    }

    updateZoomControls();
    loadDocument().catch(error => {
        console.error('Unable to render linked scaffold PDF:', error);
        loadingElement.hidden = true;
        errorElement.hidden = false;
    });
}
