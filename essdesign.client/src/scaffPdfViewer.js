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
    const fitModeButton = document.getElementById('pdfFitMode');
    const rotateButton = document.getElementById('pdfRotate');

    let pdfDocument = null;
    let zoom = 1;
    let fitMode = 'page';
    let userRotation = 0;
    let currentPageNumber = 1;
    let renderGeneration = 0;
    let resizeTimer = 0;
    let sharpRenderTimer = 0;
    let scrollFrame = 0;
    let geometryUpdateInProgress = false;
    let pinchState = null;
    const activeTouchPointers = new Map();
    const pageCache = new Map();

    const clampZoom = value => Math.min(3, Math.max(1, value));

    function getPage(pageNumber) {
        if (!pageCache.has(pageNumber)) {
            pageCache.set(pageNumber, pdfDocument.getPage(pageNumber));
        }
        return pageCache.get(pageNumber);
    }

    function getPageMargins() {
        const tablet = viewer.clientWidth >= 700;
        return {
            horizontal: tablet ? 22 : 12,
            top: tablet ? 72 : 58,
            bottom: tablet ? 64 : 54,
        };
    }

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

    function updateControls() {
        zoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
        zoomOutButton.disabled = zoom <= 1;
        zoomInButton.disabled = zoom >= 3;
        fitModeButton.textContent = fitMode === 'page' ? 'Page' : 'Width';
        fitModeButton.setAttribute(
            'aria-label',
            fitMode === 'page' ? 'Fit PDF to screen width' : 'Fit whole PDF page',
        );
        fitModeButton.title = fitMode === 'page' ? 'Fit width' : 'Fit page';
        viewer.classList.toggle('is-zoomed', zoom > 1.001);
        viewer.classList.toggle('is-fit-width', fitMode === 'width');
    }

    function markCurrentPage(pageNumber) {
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            slot.classList.toggle(
                'is-current-page',
                Number(slot.dataset.pageNumber) === pageNumber,
            );
        });
    }

    function clampToCurrentPage() {
        if (zoom <= 1.001 && !pinchState) return false;
        const slot = pagesElement.querySelector(`[data-page-number="${currentPageNumber}"]`);
        if (!slot) return true;
        const minimumTop = slot.offsetTop;
        const maximumTop = Math.max(minimumTop, slot.offsetTop + slot.offsetHeight - viewer.clientHeight);
        const clampedTop = Math.min(maximumTop, Math.max(minimumTop, viewer.scrollTop));
        if (Math.abs(clampedTop - viewer.scrollTop) > 0.5) {
            viewer.scrollTo({ left: viewer.scrollLeft, top: clampedTop, behavior: 'auto' });
        }
        return true;
    }

    function getSlotAtPoint(contentX, contentY) {
        const slots = Array.from(pagesElement.querySelectorAll('.pdf-page-slot'));
        return slots.find(slot => (
            contentY >= slot.offsetTop
            && contentY <= slot.offsetTop + slot.offsetHeight
            && contentX >= slot.offsetLeft
            && contentX <= slot.offsetLeft + slot.offsetWidth
        )) || slots.find(slot => Number(slot.dataset.pageNumber) === currentPageNumber) || slots[0];
    }

    function captureViewAnchor(clientX = viewer.clientWidth / 2, clientY = viewer.clientHeight / 2) {
        const contentX = viewer.scrollLeft + clientX;
        const contentY = viewer.scrollTop + clientY;
        const slot = getSlotAtPoint(contentX, contentY);
        if (!slot) return null;
        const canvas = slot.querySelector('.pdf-page');
        const anchor = {
            pageNumber: Number(slot.dataset.pageNumber) || currentPageNumber,
            xRatio: (contentX - slot.offsetLeft) / Math.max(1, slot.offsetWidth),
            yRatio: (contentY - slot.offsetTop) / Math.max(1, slot.offsetHeight),
            clientX,
            clientY,
        };
        if (canvas) {
            const pageLeft = slot.offsetLeft + canvas.offsetLeft;
            const pageTop = slot.offsetTop + canvas.offsetTop;
            anchor.pageXRatio = (contentX - pageLeft) / Math.max(1, canvas.offsetWidth);
            anchor.pageYRatio = (contentY - pageTop) / Math.max(1, canvas.offsetHeight);
        }
        return anchor;
    }

    function restoreViewAnchor(anchor) {
        const pageNumber = Math.min(
            Math.max(anchor?.pageNumber || currentPageNumber, 1),
            pdfDocument.numPages,
        );
        const slot = pagesElement.querySelector(`[data-page-number="${pageNumber}"]`);
        if (!slot) return;
        const clientX = Number.isFinite(anchor?.clientX) ? anchor.clientX : viewer.clientWidth / 2;
        const clientY = Number.isFinite(anchor?.clientY) ? anchor.clientY : viewer.clientHeight / 2;
        const canvas = slot.querySelector('.pdf-page');
        const hasPageAnchor = canvas
            && Number.isFinite(anchor?.pageXRatio)
            && Number.isFinite(anchor?.pageYRatio);
        const contentX = hasPageAnchor
            ? slot.offsetLeft + canvas.offsetLeft + (canvas.offsetWidth * anchor.pageXRatio)
            : slot.offsetLeft + (slot.offsetWidth * (Number.isFinite(anchor?.xRatio) ? anchor.xRatio : 0.5));
        const contentY = hasPageAnchor
            ? slot.offsetTop + canvas.offsetTop + (canvas.offsetHeight * anchor.pageYRatio)
            : slot.offsetTop + (slot.offsetHeight * (Number.isFinite(anchor?.yRatio) ? anchor.yRatio : 0.5));
        viewer.scrollTo({
            left: Math.max(0, contentX - clientX),
            top: Math.max(0, contentY - clientY),
            behavior: 'auto',
        });
    }

    function createPlaceholder(pageNumber) {
        const placeholder = document.createElement('div');
        placeholder.className = 'pdf-page-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.innerHTML = '<span class="pdf-page-spinner"></span>';
        placeholder.dataset.pageNumber = String(pageNumber);
        return placeholder;
    }

    async function calculatePageLayout(page) {
        const margins = getPageMargins();
        const rotation = (page.rotate + userRotation + 360) % 360;
        const naturalViewport = page.getViewport({ scale: 1, rotation });
        const availableWidth = Math.max(80, viewer.clientWidth - (margins.horizontal * 2));
        const availableHeight = Math.max(120, viewer.clientHeight - margins.top - margins.bottom);
        const fitScale = fitMode === 'width'
            ? availableWidth / naturalViewport.width
            : Math.min(
                availableWidth / naturalViewport.width,
                availableHeight / naturalViewport.height,
            );
        const cssViewport = page.getViewport({ scale: fitScale * zoom, rotation });
        const baseViewport = page.getViewport({ scale: fitScale, rotation });
        return {
            baseViewport,
            cssViewport,
            margins,
            slotWidth: Math.max(
                viewer.clientWidth,
                Math.ceil(cssViewport.width + (margins.horizontal * 2)),
            ),
            slotHeight: Math.max(
                viewer.clientHeight,
                Math.ceil(cssViewport.height + margins.top + margins.bottom),
            ),
        };
    }

    function renderSignature(page, layout) {
        const rotation = (page.rotate + userRotation + 360) % 360;
        return [
            fitMode,
            rotation,
            zoom.toFixed(4),
            Math.round(layout.cssViewport.width),
            Math.round(layout.cssViewport.height),
            viewer.clientWidth,
            viewer.clientHeight,
        ].join(':');
    }

    async function renderPageCanvas(pageNumber, generation = renderGeneration) {
        if (generation !== renderGeneration) return;
        const slot = pagesElement.querySelector(`[data-page-number="${pageNumber}"]`);
        if (!slot) return;

        try {
            const page = await getPage(pageNumber);
            if (generation !== renderGeneration || !slot.isConnected) return;
            const layout = await calculatePageLayout(page);
            const signature = renderSignature(page, layout);
            if (slot.dataset.renderSignature === signature || slot.dataset.renderRequest === signature) return;
            const existingCanvas = slot.querySelector('.pdf-page');
            slot.dataset.renderRequest = signature;
            if (!existingCanvas) slot.dataset.renderState = 'rendering';
            const pixelRatio = getRenderPixelRatio(layout.cssViewport);
            const rotation = (page.rotate + userRotation + 360) % 360;
            const renderViewport = page.getViewport({
                scale: layout.cssViewport.scale * pixelRatio,
                rotation,
            });
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page';
            canvas.width = Math.max(1, Math.floor(renderViewport.width));
            canvas.height = Math.max(1, Math.floor(renderViewport.height));
            canvas.style.width = `${layout.cssViewport.width}px`;
            canvas.style.height = `${layout.cssViewport.height}px`;
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', `Rendered PDF page ${pageNumber}`);
            const context = canvas.getContext('2d', { alpha: false });
            await page.render({
                canvasContext: context,
                viewport: renderViewport,
                background: '#ffffff',
            }).promise;
            if (
                generation !== renderGeneration
                || !slot.isConnected
                || slot.dataset.renderRequest !== signature
            ) return;
            slot.replaceChildren(canvas);
            slot.dataset.renderState = 'rendered';
            slot.dataset.renderSignature = signature;
            slot.dataset.renderRequest = '';
        } catch (error) {
            if (generation !== renderGeneration) return;
            if (!slot.querySelector('.pdf-page')) slot.dataset.renderState = 'error';
            slot.dataset.renderRequest = '';
            console.error(`Unable to render PDF page ${pageNumber}:`, error);
        }
    }

    function releaseDistantPages(centerPage) {
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            const pageNumber = Number(slot.dataset.pageNumber);
            if (Math.abs(pageNumber - centerPage) <= 1 || slot.dataset.renderState !== 'rendered') return;
            slot.replaceChildren(createPlaceholder(pageNumber));
            slot.dataset.renderState = 'idle';
            slot.dataset.renderSignature = '';
            slot.dataset.renderRequest = '';
        });
    }

    async function renderVisiblePages(pageNumber, generation = renderGeneration) {
        await renderPageCanvas(pageNumber, generation);
        if (generation !== renderGeneration) return;
        releaseDistantPages(pageNumber);
        [pageNumber - 1, pageNumber + 1]
            .filter(candidate => candidate >= 1 && candidate <= pdfDocument.numPages)
            .forEach(candidate => { void renderPageCanvas(candidate, generation); });
    }

    function updateCurrentPage() {
        scrollFrame = 0;
        if (!pdfDocument || geometryUpdateInProgress || pinchState) return;
        const slots = Array.from(pagesElement.querySelectorAll('.pdf-page-slot'));
        if (slots.length === 0) return;
        const viewerCenter = viewer.scrollTop + (viewer.clientHeight / 2);
        let closestPage = 1;
        let closestDistance = Number.POSITIVE_INFINITY;
        slots.forEach(slot => {
            const slotCenter = slot.offsetTop + (slot.offsetHeight / 2);
            const distance = Math.abs(slotCenter - viewerCenter);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestPage = Number(slot.dataset.pageNumber) || 1;
            }
        });
        pageIndicator.textContent = `${closestPage} / ${pdfDocument.numPages}`;
        if (closestPage !== currentPageNumber) {
            currentPageNumber = closestPage;
            markCurrentPage(closestPage);
            void renderVisiblePages(closestPage);
        }
    }

    async function renderPages({ preservePosition = true, anchor = null } = {}) {
        if (!pdfDocument) return;
        const generation = ++renderGeneration;
        const savedAnchor = anchor || (preservePosition ? captureViewAnchor() : null);
        const targetPage = Math.min(
            Math.max(savedAnchor?.pageNumber || currentPageNumber, 1),
            pdfDocument.numPages,
        );

        loadingElement.hidden = false;
        errorElement.hidden = true;
        pagesElement.replaceChildren();
        pagesElement.setAttribute('aria-busy', 'true');

        try {
            for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
                if (generation !== renderGeneration) return;
                const page = await getPage(pageNumber);
                const layout = await calculatePageLayout(page);
                const slot = document.createElement('section');
                slot.className = 'pdf-page-slot';
                slot.dataset.pageNumber = String(pageNumber);
                slot.dataset.renderState = 'idle';
                slot.dataset.basePageWidth = String(layout.baseViewport.width);
                slot.dataset.basePageHeight = String(layout.baseViewport.height);
                slot.dataset.marginHorizontal = String(layout.margins.horizontal);
                slot.dataset.marginTop = String(layout.margins.top);
                slot.dataset.marginBottom = String(layout.margins.bottom);
                slot.setAttribute('aria-label', `Page ${pageNumber} of ${pdfDocument.numPages}`);
                slot.style.width = `${layout.slotWidth}px`;
                slot.style.height = `${layout.slotHeight}px`;
                slot.style.padding = `${layout.margins.top}px ${layout.margins.horizontal}px ${layout.margins.bottom}px`;
                slot.appendChild(createPlaceholder(pageNumber));
                pagesElement.appendChild(slot);
            }

            if (generation !== renderGeneration) return;
            currentPageNumber = targetPage;
            markCurrentPage(targetPage);
            restoreViewAnchor(savedAnchor || {
                pageNumber: targetPage,
                xRatio: 0.5,
                yRatio: 0.5,
                clientX: viewer.clientWidth / 2,
                clientY: viewer.clientHeight / 2,
            });
            pageIndicator.textContent = `${targetPage} / ${pdfDocument.numPages}`;
            updateControls();
            await renderVisiblePages(targetPage, generation);
            if (generation !== renderGeneration) return;
            restoreViewAnchor(savedAnchor);
            pagesElement.setAttribute('aria-busy', 'false');
            loadingElement.hidden = true;
        } catch (error) {
            if (generation !== renderGeneration) return;
            throw error;
        }
    }

    function scheduleSharpRender(delay = 140) {
        window.clearTimeout(sharpRenderTimer);
        sharpRenderTimer = window.setTimeout(() => {
            void renderVisiblePages(currentPageNumber);
        }, delay);
    }

    function applyZoomGeometry(nextZoom, anchor = null) {
        const normalizedZoom = clampZoom(nextZoom);
        if (!pdfDocument) return;
        if (Math.abs(normalizedZoom - zoom) < 0.001) {
            if (anchor) {
                restoreViewAnchor(anchor);
                clampToCurrentPage();
            }
            return;
        }
        const savedAnchor = anchor || captureViewAnchor();
        geometryUpdateInProgress = true;
        viewer.classList.add('is-adjusting');
        zoom = normalizedZoom;
        updateControls();
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            const baseWidth = Number(slot.dataset.basePageWidth);
            const baseHeight = Number(slot.dataset.basePageHeight);
            const marginHorizontal = Number(slot.dataset.marginHorizontal);
            const marginTop = Number(slot.dataset.marginTop);
            const marginBottom = Number(slot.dataset.marginBottom);
            if (![baseWidth, baseHeight, marginHorizontal, marginTop, marginBottom].every(Number.isFinite)) return;
            const pageWidth = baseWidth * zoom;
            const pageHeight = baseHeight * zoom;
            slot.style.width = `${Math.max(viewer.clientWidth, Math.ceil(pageWidth + (marginHorizontal * 2)))}px`;
            slot.style.height = `${Math.max(viewer.clientHeight, Math.ceil(pageHeight + marginTop + marginBottom))}px`;
            const canvas = slot.querySelector('.pdf-page');
            if (canvas) {
                canvas.style.width = `${pageWidth}px`;
                canvas.style.height = `${pageHeight}px`;
            }
            slot.dataset.renderRequest = '';
        });
        if (savedAnchor?.pageNumber) currentPageNumber = savedAnchor.pageNumber;
        markCurrentPage(currentPageNumber);
        pageIndicator.textContent = `${currentPageNumber} / ${pdfDocument.numPages}`;
        restoreViewAnchor(savedAnchor);
        clampToCurrentPage();
        scheduleSharpRender();
        window.requestAnimationFrame(() => {
            geometryUpdateInProgress = false;
            viewer.classList.remove('is-adjusting');
        });
    }

    zoomOutButton.addEventListener('click', () => applyZoomGeometry(zoom - 0.25));
    zoomFitButton.addEventListener('click', () => applyZoomGeometry(1));
    zoomInButton.addEventListener('click', () => applyZoomGeometry(zoom + 0.25));
    fitModeButton.addEventListener('click', async () => {
        if (!pdfDocument) return;
        const anchor = captureViewAnchor();
        fitMode = fitMode === 'page' ? 'width' : 'page';
        zoom = 1;
        updateControls();
        await renderPages({ anchor });
    });
    rotateButton.addEventListener('click', async () => {
        if (!pdfDocument) return;
        const anchor = captureViewAnchor();
        userRotation = (userRotation + 90) % 360;
        zoom = 1;
        rotateButton.setAttribute('aria-label', `Rotate PDF clockwise. Current rotation ${userRotation} degrees`);
        await renderPages({ anchor });
    });

    viewer.addEventListener('scroll', () => {
        if (clampToCurrentPage()) return;
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
        const clientX = ((pointers[0].x + pointers[1].x) / 2) - bounds.left;
        const clientY = ((pointers[0].y + pointers[1].y) / 2) - bounds.top;
        pinchState = {
            startDistance,
            startZoom: zoom,
            draftZoom: zoom,
            anchor: captureViewAnchor(clientX, clientY),
        };
        viewer.classList.add('is-pinching');
    }

    function updatePinch() {
        if (!pinchState || activeTouchPointers.size < 2) return;
        const pointers = Array.from(activeTouchPointers.values()).slice(0, 2);
        const distance = pointerDistance(pointers);
        pinchState.draftZoom = clampZoom(
            pinchState.startZoom * (distance / pinchState.startDistance),
        );
        const bounds = viewer.getBoundingClientRect();
        const clientX = ((pointers[0].x + pointers[1].x) / 2) - bounds.left;
        const clientY = ((pointers[0].y + pointers[1].y) / 2) - bounds.top;
        applyZoomGeometry(pinchState.draftZoom, {
            ...pinchState.anchor,
            clientX,
            clientY,
        });
    }

    function finishPinch() {
        if (!pinchState) return;
        pinchState = null;
        viewer.classList.remove('is-pinching');
        geometryUpdateInProgress = false;
        viewer.classList.remove('is-adjusting');
        updateControls();
        scheduleSharpRender(60);
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
        const anchor = captureViewAnchor();
        resizeTimer = window.setTimeout(() => renderPages({ anchor }), 180);
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
        await renderPages({ preservePosition: false });
    }

    updateControls();
    loadDocument().catch(error => {
        console.error('Unable to render linked scaffold PDF:', error);
        loadingElement.hidden = true;
        errorElement.hidden = false;
    });
}
