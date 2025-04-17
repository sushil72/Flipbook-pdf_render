import React, { useState, useEffect, useRef, useCallback } from "react";
import FlipPage from "react-flip-page";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

// Set PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const FlipBook = () => {
  const [pdfDocument, setPdfDocument] = useState(null);
  const [visiblePages, setVisiblePages] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [fileName, setFileName] = useState("");
  const [renderQuality, setRenderQuality] = useState(0.8); // Default quality setting

  // Config options for different PDF sizes
  const CONFIG = {
    small: {
      // < 50 pages
      bufferSize: 20,
      initialChunkSize: 6,
      quality: 0.8,
    },
    medium: {
      // 50-200 pages
      bufferSize: 10,
      initialChunkSize: 4,
      quality: 0.7,
    },
    large: {
      // 200-500 pages
      bufferSize: 6,
      initialChunkSize: 2,
      quality: 0.6,
    },
    veryLarge: {
      // > 500 pages
      bufferSize: 4,
      initialChunkSize: 2,
      quality: 0.5,
    },
  };

  // Dynamic configuration based on PDF size
  const [pageBufferSize, setPageBufferSize] = useState(10);
  const [initialChunkSize, setInitialChunkSize] = useState(4);

  // Page cache with enhanced management
  const pageCache = useRef({});
  // Worker pool for parallel rendering
  const workerPool = useRef([]);
  // Track if component is mounted
  const isMounted = useRef(true);
  // Track which pages are currently being rendered
  const renderingPages = useRef(new Set());
  // Track the last viewed page to prioritize direction
  const lastPageIndex = useRef(0);

  // Clean up resources when component unmounts
  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
      clearPageCache();
      terminateWorkers();
    };
  }, []);

  const terminateWorkers = () => {
    if (pdfDocument) {
      pdfDocument
        .destroy()
        .catch((e) => console.warn("Error destroying PDF document:", e));
    }
    if (workerPool.current.length > 0) {
      workerPool.current.forEach((worker) => {
        if (worker && worker.terminate) {
          worker.terminate();
        }
      });
      workerPool.current = [];
    }
  };

  // Load basic PDF metadata from localStorage on component mount
  useEffect(() => {
    const storedFileName = localStorage.getItem("pdfFileName");
    const storedTotalPages = localStorage.getItem("pdfTotalPages");
    const storedPdfData = localStorage.getItem("pdfData");

    if (storedPdfData && storedTotalPages) {
      try {
        setFileName(storedFileName || "Saved PDF");
        setTotalPages(parseInt(storedTotalPages, 10));
        setFullscreen(true);

        // Load the PDF document from stored data
        const binaryData = atob(storedPdfData);
        const bytes = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
          bytes[i] = binaryData.charCodeAt(i);
        }

        loadPdfDocument(bytes);
      } catch (error) {
        console.error("Error loading PDF from localStorage:", error);
        clearLocalStorage();
      }
    }
  }, []);

  // Update fullscreen state based on PDF document
  useEffect(() => {
    if (pdfDocument && !isLoading) {
      setFullscreen(true);
    } else if (!isLoading && !pdfDocument) {
      setFullscreen(false);
    }
  }, [pdfDocument, isLoading]);

  // Select configuration based on PDF size
  useEffect(() => {
    if (totalPages > 0) {
      let config;
      if (totalPages > 500) {
        config = CONFIG.veryLarge;
      } else if (totalPages > 200) {
        config = CONFIG.large;
      } else if (totalPages > 50) {
        config = CONFIG.medium;
      } else {
        config = CONFIG.small;
      }

      setPageBufferSize(config.bufferSize);
      setInitialChunkSize(config.initialChunkSize);
      setRenderQuality(config.quality);

      console.log(`PDF size: ${totalPages} pages, using config:`, config);
    }
  }, [totalPages]);

  // Track page direction to prioritize loading
  useEffect(() => {
    if (currentPageIndex !== lastPageIndex.current) {
      lastPageIndex.current = currentPageIndex;
    }
  }, [currentPageIndex]);

  // Load visible pages whenever the current page index changes
  const loadVisiblePagesCallback = useCallback(() => {
    if (pdfDocument && totalPages > 0) {
      loadVisiblePages(currentPageIndex);
    }
  }, [currentPageIndex, pdfDocument, totalPages, zoomLevel]);

  useEffect(() => {
    if (pdfDocument && totalPages > 0) {
      // Use a debounced version of the page loader to avoid excessive rendering
      const debounceTimer = setTimeout(() => {
        loadVisiblePagesCallback();
      }, 100);

      return () => clearTimeout(debounceTimer);
    }
  }, [loadVisiblePagesCallback]);

  // Function to save PDF metadata to localStorage
  const saveToLocalStorage = (pdfBytes, name, numPages) => {
    try {
      // Store only metadata and binary data, not rendered pages
      localStorage.setItem("pdfFileName", name);
      localStorage.setItem("pdfTotalPages", numPages.toString());

      // Store binary PDF data as base64 string (with size limitation)
      const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB limit
      if (pdfBytes.length <= MAX_STORAGE_SIZE) {
        const base64Data = btoa(String.fromCharCode.apply(null, pdfBytes));
        localStorage.setItem("pdfData", base64Data);
      } else {
        console.warn("PDF too large for localStorage, storing metadata only");
      }
    } catch (error) {
      console.error("Error saving to localStorage:", error);
      if (error.name === "QuotaExceededError") {
        alert(
          "The PDF is too large to store. Only the current session will be saved."
        );
      }
    }
  };

  // Function to clear localStorage
  const clearLocalStorage = () => {
    localStorage.removeItem("pdfData");
    localStorage.removeItem("pdfFileName");
    localStorage.removeItem("pdfTotalPages");
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
      setFileName(file.name);
      setIsLoading(true);
      clearPageCache();
      setVisiblePages([]);
      setZoomLevel(1);

      try {
        // Read the file as a blob instead of ArrayBuffer
        const fileBlob = file.slice(0, file.size);

        // For metadata - create one copy of the data
        const metadataBuffer = await fileBlob.arrayBuffer();
        const metadataBytes = new Uint8Array(metadataBuffer);

        // First load PDF metadata to determine size and configure for optimal performance
        const loadingTask = pdfjs.getDocument({
          data: metadataBytes,
          disableWorker: true, // Disable the worker for debugging
        });
        const pdf = await loadingTask.promise;

        // Set total pages first to trigger configuration selection
        setTotalPages(pdf.numPages);

        // For the actual document loading - create a second copy
        const docBuffer = await fileBlob.arrayBuffer();
        const docBytes = new Uint8Array(docBuffer);

        await loadPdfDocument(docBytes);

        // For localStorage - create a third copy if needed
        const storageBuffer = await fileBlob.arrayBuffer();
        const storageBytes = new Uint8Array(storageBuffer);
        saveToLocalStorage(storageBytes, file.name, pdf.numPages);
      } catch (error) {
        console.error("Error loading PDF:", error);
        alert("Error loading PDF. Please try again.");
        setPdfDocument(null);
        setTotalPages(0);
      } finally {
        setIsLoading(false);
      }
    } else {
      alert("Please select a valid PDF file.");
    }
  };

  // Load PDF document and get metadata
  const loadPdfDocument = async (pdfBytes) => {
    try {
      const loadingTask = pdfjs.getDocument({
        data: pdfBytes,
        // Using cMapUrl and cMapPacked can help with character encoding
        cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@2.12.313/cmaps/",
        cMapPacked: true,
        disableWorker: false, // Try enabling the worker
        // If worker is enabled, ensure workerSrc is properly set
        workerSrc: pdfWorker,
      });

      loadingTask.onProgress = (progressData) => {
        if (progressData.total > 0) {
          setLoadingProgress(
            Math.floor((progressData.loaded / progressData.total) * 100)
          );
        }
      };

      const pdf = await loadingTask.promise;
      setPdfDocument(pdf);

      if (totalPages === 0) {
        setTotalPages(pdf.numPages);
      }

      setCurrentPageIndex(0);
      await preloadInitialPages(pdf);

      return pdf;
    } catch (error) {
      console.error("Error loading PDF document:", error);
      throw error;
    }
  };

  // Clear page cache
  const clearPageCache = () => {
    Object.values(pageCache.current).forEach((url) => {
      URL.revokeObjectURL(url);
    });
    pageCache.current = {};
    renderingPages.current.clear();
  };

  // Preload initial pages for faster rendering
  const preloadInitialPages = async (pdf) => {
    const initialPages = [];
    const endPage = Math.min(initialChunkSize, pdf.numPages);

    // Create array of page numbers to load
    const pagesToLoad = Array.from({ length: endPage }, (_, i) => i + 1);

    // Process pages in parallel with a limit
    const results = await Promise.allSettled(
      pagesToLoad.map(async (pageNumber) => {
        try {
          const pageImageUrl = await renderPageToURL(pdf, pageNumber);
          return {
            index: pageNumber - 1,
            url: pageImageUrl,
            status: "success",
          };
        } catch (error) {
          console.error(`Error preloading page ${pageNumber}:`, error);
          return { index: pageNumber - 1, status: "error" };
        } finally {
          setLoadingProgress(Math.floor((pageNumber / endPage) * 100));
        }
      })
    );

    // Filter successful results
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value.status === "success") {
        initialPages.push({ index: result.value.index, url: result.value.url });
      }
    });

    if (isMounted.current) {
      setVisiblePages(initialPages);
    }
  };

  // Render a single page to a data URL with memory optimization
  const renderPageToURL = async (pdf, pageNumber) => {
    // Check if page is already in cache
    if (pageCache.current[pageNumber]) {
      return pageCache.current[pageNumber];
    }

    // Check if page is already being rendered
    if (renderingPages.current.has(pageNumber)) {
      return new Promise((resolve) => {
        const checkCache = () => {
          if (pageCache.current[pageNumber]) {
            resolve(pageCache.current[pageNumber]);
          } else {
            setTimeout(checkCache, 100);
          }
        };
        checkCache();
      });
    }

    // Mark page as being rendered
    renderingPages.current.add(pageNumber);

    try {
      const page = await pdf.getPage(pageNumber);
      const scale = 1.5 * zoomLevel; // Base scale adjusted by zoom level
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      // Convert canvas to base64 string
      const base64Data = canvas.toDataURL("image/jpeg", renderQuality);

      // Save base64 data to localStorage
      localStorage.setItem(`page_${pageNumber}`, base64Data);

      // Save to cache
      pageCache.current[pageNumber] = base64Data;

      // Remove page from rendering set
      renderingPages.current.delete(pageNumber);

      return base64Data;
    } catch (error) {
      renderingPages.current.delete(pageNumber);
      console.error(`Error rendering page ${pageNumber}:`, error);
      throw error;
    }
  };

  // Prune the page cache to manage memory
  const prunePageCache = (currentPageNum) => {
    const cacheKeys = Object.keys(pageCache.current);
    if (cacheKeys.length > pageBufferSize) {
      // Calculate direction of reading to prioritize keeping pages in that direction
      const isForward = currentPageIndex >= lastPageIndex.current;

      // Find pages furthest from current page to remove
      const pagesToRemove = cacheKeys
        .map((key) => parseInt(key, 10))
        .sort((a, b) => {
          // Calculate weighted distance based on reading direction
          const distA = Math.abs(a - currentPageNum);
          const distB = Math.abs(b - currentPageNum);

          // If moving forward, prioritize keeping pages ahead
          if (isForward) {
            // Give penalty to pages behind current page
            const penaltyA = a < currentPageNum ? 10 : 0;
            const penaltyB = b < currentPageNum ? 10 : 0;
            return distB + penaltyB - (distA + penaltyA);
          } else {
            // Give penalty to pages ahead of current page
            const penaltyA = a > currentPageNum ? 10 : 0;
            const penaltyB = b > currentPageNum ? 10 : 0;
            return distB + penaltyB - (distA + penaltyA);
          }
        })
        .slice(0, cacheKeys.length - pageBufferSize);

      pagesToRemove.forEach((pageNum) => {
        if (pageCache.current[pageNum]) {
          URL.revokeObjectURL(pageCache.current[pageNum]);
          delete pageCache.current[pageNum];
        }
      });
    }
  };

  // Load visible pages based on current page index with priority loading
  const loadVisiblePages = async (currentIndex) => {
    if (!pdfDocument || !isMounted.current) return;

    // Calculate range of pages to load with priority for the current spread
    const currentSpreadStart = Math.floor(currentIndex / 2) * 2;
    const currentSpreadEnd = Math.min(currentSpreadStart + 1, totalPages - 1);

    // Priority 1: Current spread (the two pages currently visible)
    const priorityPages = [];
    for (let i = currentSpreadStart; i <= currentSpreadEnd; i++) {
      priorityPages.push(i + 1); // Convert to 1-based page numbers
    }

    // Priority 2: Next spread
    const nextSpreadStart = currentSpreadStart + 2;
    if (nextSpreadStart < totalPages) {
      priorityPages.push(nextSpreadStart + 1);
      if (nextSpreadStart + 1 < totalPages) {
        priorityPages.push(nextSpreadStart + 2);
      }
    }

    // Priority 3: Previous spread
    const prevSpreadStart = currentSpreadStart - 2;
    if (prevSpreadStart >= 0) {
      priorityPages.push(prevSpreadStart + 1);
      if (prevSpreadStart + 1 < totalPages) {
        priorityPages.push(prevSpreadStart + 2);
      }
    }

    // Priority 4: Additional pages in reading direction
    const isForward = currentIndex >= lastPageIndex.current;
    const additionalPages = [];

    if (isForward) {
      // Add pages ahead if moving forward
      const startPage = nextSpreadStart + 2;
      const endPage = Math.min(startPage + 4, totalPages);
      for (let i = startPage; i < endPage; i++) {
        additionalPages.push(i + 1);
      }
    } else {
      // Add pages behind if moving backward
      const endPage = prevSpreadStart - 1;
      const startPage = Math.max(0, endPage - 4);
      for (let i = startPage; i <= endPage; i++) {
        additionalPages.push(i + 1);
      }
    }

    // Combine all pages to load, prioritizing current and adjacent spreads
    const allPagesToLoad = [...new Set([...priorityPages, ...additionalPages])];

    // Load priority pages first (current spread)
    const priorityPromises = priorityPages
      .map((pageNumber) =>
        pageCache.current[pageNumber]
          ? null
          : renderPageToURL(pdfDocument, pageNumber)
      )
      .filter(Boolean);

    try {
      await Promise.allSettled(priorityPromises);

      // Then load additional pages
      const additionalPromises = additionalPages
        .map((pageNumber) =>
          pageCache.current[pageNumber]
            ? null
            : renderPageToURL(pdfDocument, pageNumber)
        )
        .filter(Boolean);

      // Load additional pages with lower priority
      Promise.allSettled(additionalPromises);
    } catch (error) {
      console.error("Error loading pages:", error);
    }

    // Update visible pages based on what's in the cache
    if (isMounted.current) {
      setVisiblePages((prevPages) => {
        const newPages = [...prevPages];

        // Add all cached pages to visible pages
        Object.keys(pageCache.current).forEach((pageNumber) => {
          const pageIndex = parseInt(pageNumber, 10) - 1;
          const existingPageIndex = newPages.findIndex(
            (p) => p.index === pageIndex
          );

          if (existingPageIndex >= 0) {
            // Update existing page
            newPages[existingPageIndex] = {
              index: pageIndex,
              url: pageCache.current[pageNumber],
            };
          } else {
            // Add new page
            newPages.push({
              index: pageIndex,
              url: pageCache.current[pageNumber],
            });
          }
        });

        return newPages.sort((a, b) => a.index - b.index);
      });
    }
  };

  // Function to exit fullscreen and upload a new PDF
  const handleReset = () => {
    clearLocalStorage();
    clearPageCache();
    setPdfDocument(null);
    setVisiblePages([]);
    setTotalPages(0);
    setCurrentPageIndex(0);
    setSelectedFile(null);
    setIsLoading(false);
    setLoadingProgress(0);
    setFullscreen(false);
    setZoomLevel(1);
    setFileName("");

    // Remove all saved pages from localStorage
    for (let i = 1; i <= totalPages; i++) {
      localStorage.removeItem(`page_${i}`);
    }
  };

  // Handle page change in FlipPage component
  const handlePageChange = (pageIndex) => {
    setCurrentPageIndex(pageIndex * 2);
  };

  // Zoom functions
  const zoomIn = () => {
    setZoomLevel((prevZoom) => {
      const newZoom = Math.min(prevZoom + 0.25, 3);
      // Force reload visible pages with new zoom level
      clearPageCache();
      return newZoom;
    });
  };

  const zoomOut = () => {
    setZoomLevel((prevZoom) => {
      const newZoom = Math.max(prevZoom - 0.25, 0.5);
      // Force reload visible pages with new zoom level
      clearPageCache();
      return newZoom;
    });
  };

  const resetZoom = () => {
    setZoomLevel(1);
    clearPageCache();
  };

  // Generate pages for FlipPage component with performance optimizations
  const getFlipPageContent = () => {
    // Group pages into spreads (pairs)
    const spreads = [];
    const maxSpreads = Math.ceil(totalPages / 2);

    // Calculate visible spread range to avoid rendering too many spreads
    const currentSpread = Math.floor(currentPageIndex / 2);
    const minSpread = Math.max(0, currentSpread - 2);
    const maxSpread = Math.min(maxSpreads - 1, currentSpread + 2);

    // Only create DOM elements for spreads that are close to current view
    for (let spreadIndex = minSpread; spreadIndex <= maxSpread; spreadIndex++) {
      const leftPageIndex = spreadIndex * 2;
      const rightPageIndex = leftPageIndex + 1;

      const leftPage = visiblePages.find((p) => p.index === leftPageIndex);
      const rightPage = visiblePages.find((p) => p.index === rightPageIndex);

      if (leftPage || rightPage || spreadIndex === currentSpread) {
        spreads.push({
          spreadIndex,
          leftPage,
          rightPage,
          isVisible: spreadIndex === currentSpread,
        });
      }
    }

    // Add empty spreads for correct pagination
    while (spreads.length > 0 && spreads[0].spreadIndex > 0) {
      spreads.unshift({
        spreadIndex: spreads[0].spreadIndex - 1,
        leftPage: null,
        rightPage: null,
        isVisible: false,
      });
    }

    while (
      spreads.length > 0 &&
      spreads[spreads.length - 1].spreadIndex < maxSpreads - 1
    ) {
      spreads.push({
        spreadIndex: spreads[spreads.length - 1].spreadIndex + 1,
        leftPage: null,
        rightPage: null,
        isVisible: false,
      });
    }

    return spreads.map((spread) => (
      <div key={spread.spreadIndex} className="page flex h-full w-full">
        {spread.leftPage ? (
          <img
            src={spread.leftPage.url}
            alt={`Page ${spread.leftPage.index + 1}`}
            className="w-1/2 h-full object-contain bg-white"
            loading={spread.isVisible ? "eager" : "lazy"}
          />
        ) : (
          <div className="w-1/2 h-full bg-gray-100 flex items-center justify-center">
            {spread.isVisible &&
            spread.leftPage === undefined &&
            spread.spreadIndex * 2 < totalPages ? (
              <p className="text-gray-400">Loading...</p>
            ) : null}
          </div>
        )}

        {spread.rightPage ? (
          <img
            src={spread.rightPage.url}
            alt={`Page ${spread.rightPage.index + 1}`}
            className="w-1/2 h-full object-contain bg-white"
            loading={spread.isVisible ? "eager" : "lazy"}
          />
        ) : (
          <div className="w-1/2 h-full bg-gray-100 flex items-center justify-center">
            {spread.isVisible &&
            spread.rightPage === undefined &&
            spread.spreadIndex * 2 + 1 < totalPages ? (
              <p className="text-gray-400">Loading...</p>
            ) : null}
          </div>
        )}
      </div>
    ));
  };

  // Performance information display
  const PerformanceInfo = () => {
    return (
      <div className="absolute top-14 right-4 z-10 p-2 bg-black bg-opacity-50 text-white text-xs rounded">
        <div>PDF: {totalPages} pages</div>
        <div>
          Cache: {Object.keys(pageCache.current).length}/{pageBufferSize} pages
        </div>
        <div>Rendering: {renderingPages.current.size} page(s)</div>
        <div>Quality: {Math.round(renderQuality * 100)}%</div>
      </div>
    );
  };

  useEffect(() => {
    const storedPages = [];
    for (let i = 1; i <= totalPages; i++) {
      const base64Data = localStorage.getItem(`page_${i}`);
      if (base64Data) {
        storedPages.push({ index: i - 1, url: base64Data });
      }
    }
    setVisiblePages(storedPages);
  }, [totalPages]);

  return (
    <div
      className={`flex flex-col items-center justify-center ${
        fullscreen
          ? "fixed inset-0 z-50 bg-gray-900"
          : "min-h-screen bg-gray-200 p-4"
      }`}
    >
      {/* Only show upload section when not in fullscreen mode */}
      {!fullscreen && (
        <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md mb-4">
          <h2 className="text-xl font-bold mb-4 text-center">
            PDF FlipBook Viewer
          </h2>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="w-full mb-4 p-2 border border-gray-300 rounded"
            disabled={isLoading}
          />
          <p className="text-sm text-gray-500 text-center">
            Select a PDF file to view as a flipbook
          </p>
        </div>
      )}

      {/* Improved Loader with Progress */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center w-full h-64 bg-white rounded-lg shadow-md p-6">
          <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 mb-2">
            Loading PDF... {loadingProgress}%
          </p>
          <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Fullscreen FlipBook */}
      {pdfDocument && visiblePages.length > 0 && !isLoading && (
        <>
          <div className="relative w-full h-full flex flex-col">
            {/* File name, page counter and Exit button in top bar */}
            <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center p-4 bg-black bg-opacity-50">
              <div className="flex items-center space-x-4">
                <p className="text-white truncate max-w-md">{fileName}</p>
                <span className="text-white text-sm">
                  {Math.floor(currentPageIndex / 2) + 1} /{" "}
                  {Math.ceil(totalPages / 2)}
                </span>
              </div>
              <button
                onClick={handleReset}
                className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition shadow-lg"
                aria-label="Exit fullscreen and upload new PDF"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Debug performance info */}
            <PerformanceInfo />

            {/* Fullscreen FlipBook with lazy loading */}
            <div className="flex-1 w-full h-full">
              <FlipPage
                width={window.innerWidth}
                height={window.innerHeight}
                orientation="horizontal"
                uncutPages={true}
                flipOnTouch={true}
                animationDuration={300} // Faster animation for better performance
                className="flipbook-container"
                showSwipeHint={false} // Disable swipe hint for better performance
                onPageChange={handlePageChange}
                responsiveWidth={true}
              >
                {getFlipPageContent()}
              </FlipPage>
            </div>

            {/* Zoom controls at bottom center */}
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10 flex items-center space-x-2 bg-black bg-opacity-50 rounded-full p-2 shadow-lg">
              <button
                onClick={zoomOut}
                className="p-2 bg-gray-800 text-white rounded-full hover:bg-gray-700 transition"
                aria-label="Zoom out"
                disabled={zoomLevel <= 0.5}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
              </button>
              <button
                onClick={resetZoom}
                className="p-2 bg-gray-800 text-white rounded-full hover:bg-gray-700 transition"
                aria-label="Reset zoom"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                onClick={zoomIn}
                className="p-2 bg-gray-800 text-white rounded-full hover:bg-gray-700 transition"
                aria-label="Zoom in"
                disabled={zoomLevel >= 3}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  <line x1="11" y1="8" x2="11" y2="14"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FlipBook;
