import React, { useState, useEffect } from "react";
import FlipPage from "react-flip-page";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

// Set PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const FlipBook = () => {
  const [pages, setPages] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Handle fullscreen mode
  useEffect(() => {
    if (pages.length > 0 && !isLoading) {
      setFullscreen(true);
    } else {
      setFullscreen(false);
    }
  }, [pages, isLoading]);

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
      setIsLoading(true);
      setPages([]); // Clear any previous pages
      setZoomLevel(1); // Reset zoom level
      try {
        await loadPDF(file);
      } catch (error) {
        console.error("Error loading PDF:", error);
        alert("Error loading PDF. Please try again.");
      } finally {
        setIsLoading(false);
      }
    } else {
      alert("Please select a valid PDF file.");
    }
  };

  const loadPDF = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsArrayBuffer(file);

      reader.onload = async (e) => {
        try {
          const pdfData = new Uint8Array(e.target.result);
          const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
          const numPages = pdf.numPages;
          const loadedPages = [];

          for (let i = 1; i <= numPages; i++) {
            // Update loading progress
            setLoadingProgress(Math.floor((i / numPages) * 100));

            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.5 });

            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvasContext: context, viewport }).promise;
            loadedPages.push(canvas.toDataURL("image/png"));
          }

          setPages(loadedPages);
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = reject;
    });
  };

  // Function to exit fullscreen and upload a new PDF
  const handleReset = () => {
    setSelectedFile(null);
    setPages([]);
    setIsLoading(false);
    setLoadingProgress(0);
    setFullscreen(false);
    setZoomLevel(1);
  };

  // Zoom functions
  const zoomIn = () => {
    setZoomLevel((prevZoom) => Math.min(prevZoom + 0.25, 3));
  };

  const zoomOut = () => {
    setZoomLevel((prevZoom) => Math.max(prevZoom - 0.25, 0.5));
  };

  const resetZoom = () => {
    setZoomLevel(1);
  };

  return (
    <div
      className={`flex flex-col items-center justify-center ${
        fullscreen
          ? "fixed inset-0 z-50 bg-black"
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
        <div className="flex flex-col items-center justify-center w-full h-[300px] bg-white rounded-lg shadow-md p-6">
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
      {pages.length > 0 && !isLoading && (
        <>
          <div className="relative w-full h-full flex flex-col">
            {/* Exit button in top-right corner */}
            <button
              onClick={handleReset}
              className="absolute top-4 right-4 z-10 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition shadow-lg"
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

            {/* Fullscreen FlipBook with zoom applied */}
            <div className="flex-1 w-full h-full">
              <FlipPage
                width={window.innerWidth}
                height={window.innerHeight}
                orientation="horizontal"
                uncutPages={true}
                flipOnTouch={true}
                animationDuration={500}
                className="flipbook-container"
                showSwipeHint={true}
              >
                {Array.from({ length: Math.ceil(pages.length / 2) }).map(
                  (_, index) => (
                    <div
                      key={index}
                      className="page flex h-full w-full"
                      style={{
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: "center center",
                      }}
                    >
                      <img
                        src={pages[index * 2]}
                        alt={`Page ${index * 2 + 1}`}
                        className="w-1/2 h-full object-contain bg-white"
                      />
                      {pages[index * 2 + 1] && (
                        <img
                          src={pages[index * 2 + 1]}
                          alt={`Page ${index * 2 + 2}`}
                          className="w-1/2 h-full object-contain bg-white"
                        />
                      )}
                    </div>
                  )
                )}
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
                className="px-3 py-1 bg-gray-800 text-white text-sm rounded-full hover:bg-gray-700 transition"
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

      {!isLoading && pages.length === 0 && selectedFile && (
        <div className="text-center p-4 bg-red-100 border border-red-300 rounded-lg">
          <p className="text-red-600">Failed to load PDF. Please try again.</p>
          <button
            onClick={handleReset}
            className="mt-2 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition text-sm"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};

export default FlipBook;
