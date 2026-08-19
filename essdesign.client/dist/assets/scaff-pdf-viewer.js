import {
  GlobalWorkerOptions,
  getDocument,
} from './pdf-BnPRJEQ6.js';

GlobalWorkerOptions.workerSrc = new URL(
  '/assets/pdf.worker.min-yatZIOMy.mjs',
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
  let currentPage = 1;
  let zoom = 1;
  let rotation = 0;
  let fitMode = 'page';
  let renderGeneration = 0;
  let resizeTimer = 0;
  let touchStart = null;

  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  const nextFrame = () => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  function updateToolbar() {
    const pageCount = pdfDocument?.numPages || 0;
    pageIndicator.textContent = `${currentPage} / ${pageCount || 1}`;
    zoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
    zoomOutButton.disabled = zoom <= 1.001;
    zoomInButton.disabled = zoom >= 4;
    fitModeButton.textContent = fitMode === 'page' ? 'Page' : 'Width';
    fitModeButton.setAttribute(
      'aria-label',
      fitMode === 'page' ? 'Fit PDF to screen width' : 'Fit whole PDF page',
    );
    fitModeButton.title = fitMode === 'page' ? 'Fit width' : 'Fit page';
  }

  function releasePage() {
    if (renderTask) {
      try {
        renderTask.cancel();
      } catch (_) {
        // The render may already have completed.
      }
      renderTask = null;
    }
    if (activePage) {
      try {
        activePage.cleanup();
      } catch (_) {
        // PDF.js may have already released this page.
      }
      activePage = null;
    }
    pagesContainer.replaceChildren();
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
    const tablet = Math.min(window.innerWidth, window.innerHeight) >= 700;
    const pixelBudget = tablet ? 6_400_000 : 3_800_000;
    let outputScale = Math.min(
      window.devicePixelRatio || 1,
      tablet ? 2.2 : 2.35,
    );
    const requestedPixels =
      cssViewport.width * outputScale * cssViewport.height * outputScale;
    if (requestedPixels > pixelBudget) {
      outputScale *= Math.sqrt(pixelBudget / requestedPixels);
    }
    const dimensionLimit = Math.min(
      8192 / Math.max(1, cssViewport.width),
      8192 / Math.max(1, cssViewport.height),
    );
    return Math.max(1, Math.min(outputScale, dimensionLimit));
  }

  async function renderPage(pageNumber, {preserveCanvas = false} = {}) {
    if (!pdfDocument) return;

    const boundedPage = clamp(pageNumber, 1, pdfDocument.numPages);
    const generation = ++renderGeneration;
    showLoading();
    releasePage();
    await nextFrame();

    try {
      const page = await pdfDocument.getPage(boundedPage);
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

      const context = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });
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
      currentPage = boundedPage;
      updateToolbar();
      if (!preserveCanvas) {
        viewer.scrollTo({left: 0, top: 0, behavior: 'auto'});
      }
      pagesContainer.setAttribute('aria-busy', 'false');
      loading.hidden = true;

      // The completed bitmap stays visible while the page's vector operator
      // list and temporary resources are released.
      page.cleanup();
      activePage = null;
    } catch (renderError) {
      if (renderError?.name === 'RenderingCancelledException') return;
      if (generation === renderGeneration) showError(renderError);
    }
  }

  function changePage(offset) {
    if (!pdfDocument) return;
    const nextPage = clamp(currentPage + offset, 1, pdfDocument.numPages);
    if (nextPage !== currentPage) {
      zoom = 1;
      renderPage(nextPage);
    }
  }

  function setZoom(nextZoom) {
    const boundedZoom = clamp(nextZoom, 1, 4);
    if (Math.abs(boundedZoom - zoom) < 0.001) return;
    zoom = boundedZoom;
    updateToolbar();
    renderPage(currentPage);
  }

  zoomOutButton.addEventListener('click', () => setZoom(zoom - 0.25));
  zoomFitButton.addEventListener('click', () => setZoom(1));
  zoomInButton.addEventListener('click', () => setZoom(zoom + 0.25));
  fitModeButton.addEventListener('click', () => {
    fitMode = fitMode === 'page' ? 'width' : 'page';
    zoom = 1;
    updateToolbar();
    renderPage(currentPage);
  });
  rotateButton.addEventListener('click', () => {
    rotation = (rotation + 90) % 360;
    zoom = 1;
    renderPage(currentPage);
  });

  viewer.addEventListener('touchstart', event => {
    const browserScale = window.visualViewport?.scale || 1;
    if (event.touches.length !== 1 || browserScale > 1.05 || zoom > 1.001) {
      touchStart = null;
      return;
    }
    touchStart = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    };
  }, {passive: true});

  viewer.addEventListener('touchend', event => {
    if (!touchStart || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 64) return;
    const forward = Math.abs(dy) >= Math.abs(dx) ? dy < 0 : dx < 0;
    changePage(forward ? 1 : -1);
  }, {passive: true});

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if ((window.visualViewport?.scale || 1) <= 1.05) {
        renderPage(currentPage);
      }
    }, 220);
  });

  window.addEventListener('pagehide', () => {
    renderGeneration += 1;
    releasePage();
    try {
      pdfDocument?.cleanup();
      loadingTask?.destroy();
    } catch (_) {
      // The document may already be closed by Safari.
    }
  }, {once: true});

  async function openDocument() {
    if (!pdfUrl) throw new Error('No PDF URL was supplied.');
    updateToolbar();
    loadingTask = getDocument({
      url: pdfUrl,
      disableAutoFetch: true,
      isEvalSupported: false,
      verbosity: 0,
    });
    pdfDocument = await loadingTask.promise;
    updateToolbar();
    await renderPage(1);
  }

  openDocument().catch(showError);
}
