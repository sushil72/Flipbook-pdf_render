import React, { useState, useEffect, useCallback, useRef } from "react";
import FlipPage from "react-flip-page";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import axios from "axios";
// Set PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

// Cloudinary configuration - replace with your own details
const CLOUDINARY_UPLOAD_PRESET = "pdf_upload";
const CLOUDINARY_CLOUD_NAME = "dwxl9ghve";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`;
const API_KEY = 296791277168885;
const API_SECRET = "Yas_CZkZcdFO45s9XGOkPCiHF1M";
const FOLDER_NAME = "Flipbook_Data";
const PUBLIC_ID = `${FOLDER_NAME}/`;
const FlipBook = () => {
  const [pdfDocument, setPdfDocument] = useState(null);
  const [renderedPages, setRenderedPages] = useState([]);
  const [visiblePageIndices, setVisiblePageIndices] = useState([0, 1]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [fileName, setFileName] = useState("");
  const [totalPages, setTotalPages] = useState(0);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [cloudinaryUrl, setCloudinaryUrl] = useState("");
  const [storedPdfId, setStoredPdfId] = useState("");
  const flipPageRef = useRef(null);

  // Load session data on component mount
  useEffect(() => {
    const storedPdfId = localStorage.getItem("pdfId");
    const storedFileName = localStorage.getItem("pdfFileName");
    const storedCloudinaryUrl = localStorage.getItem("pdfCloudinaryUrl");
    const storedTotalPages = localStorage.getItem("pdfTotalPages");

    if (storedPdfId && storedCloudinaryUrl) {
      setStoredPdfId(storedPdfId);
      setFileName(storedFileName || "Saved PDF");
      setCloudinaryUrl(storedCloudinaryUrl);
      setTotalPages(parseInt(storedTotalPages || "0"));
      setFullscreen(true);
      loadPdfFromUrl(storedCloudinaryUrl);
    }
  }, []);

  // Lazy rendering of pages based on visibility
  useEffect(() => {
    if (pdfDocument && visiblePageIndices.length > 0) {
      visiblePageIndices.forEach(async (index) => {
        if (index >= 0 && index < totalPages && !renderedPages[index]) {
          renderPage(index);
        }
      });
    }
  }, [pdfDocument, visiblePageIndices, renderedPages, totalPages]);

  // Update fullscreen state based on PDF document
  useEffect(() => {
    if (pdfDocument && !isLoading) {
      setFullscreen(true);
    } else if (!isLoading && !storedPdfId) {
      setFullscreen(false);
    }
  }, [pdfDocument, isLoading, storedPdfId]);

  // Call the function

  // Function to load PDF from URL (Cloudinary or other)
  const loadPdfFromUrl = async (url) => {
    try {
      setIsLoading(true);
      setLoadingProgress(10);
      console.log("loadfrom url :", url);

      const loadingTask = pdfjs.getDocument(url);
      const pdf = await loadingTask.promise;

      setTotalPages(pdf.numPages);
      setPdfDocument(pdf);

      // Initialize renderedPages array with nulls
      setRenderedPages(new Array(pdf.numPages).fill(null));
      setLoadingProgress(100);
      setIsLoading(false);

      // Render first two pages immediately
      setTimeout(() => {
        renderPage(0);
        if (pdf.numPages > 1) renderPage(1);
      }, 100);
    } catch (error) {
      console.error("Error loading PDF from URL:", error);
      alert("Error loading PDF from stored URL. Please try uploading again.");
      setIsLoading(false);
      handleReset();
    }
  };

  // Function to render a specific page
  const renderPage = async (pageIndex) => {
    if (!pdfDocument || pageIndex < 0 || pageIndex >= totalPages) return;

    try {
      const page = await pdfDocument.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1.5 }); // Lower scale for better performance

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport }).promise;

      // Update the renderedPages array with the new page
      setRenderedPages((prev) => {
        const newPages = [...prev];
        newPages[pageIndex] = canvas.toDataURL("image/jpeg", 0.75); // Use JPEG with compression for better performance
        return newPages;
      });
    } catch (error) {
      console.error(`Error rendering page ${pageIndex + 1}:`, error);
    }
  };

  // Handle file selection
  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
      setFileName(file.name);
      setIsLoading(true);
      setPdfDocument(null);
      setRenderedPages([]);
      setZoomLevel(1);
      setVisiblePageIndices([0, 1]);
      setCurrentPageIndex(0);

      try {
        // First upload to Cloudinary
        setLoadingProgress(5);
        const cloudinaryUrl = await uploadToCloudinary(file);
        console.log("Cloudinary URL:", cloudinaryUrl);
        setCloudinaryUrl(cloudinaryUrl);

        // Generate a unique ID for this PDF
        const pdfId = Date.now().toString();
        setStoredPdfId(pdfId);

        // Save references to localStorage
        localStorage.setItem("pdfId", pdfId);
        localStorage.setItem("pdfFileName", file.name);
        localStorage.setItem("pdfCloudinaryUrl", cloudinaryUrl);
        localStorage.setItem("pdfTotalPages", "0"); // Will be updated after loading PDF

        // Now load the PDF from the URL
        await loadPdfFromUrl(cloudinaryUrl);
      } catch (error) {
        console.error("Error processing PDF:", error);
        alert("Error uploading or processing the PDF. Please try again.");
        setIsLoading(false);
      }
    } else {
      alert("Please select a valid PDF file.");
    }
  };

  // Upload file to Cloudinary
  const uploadToCloudinary = async (file) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("folder", "Flipbook_Data");
      formData.append("cloud_name", CLOUDINARY_CLOUD_NAME);

      fetch(CLOUDINARY_UPLOAD_URL, {
        method: "POST",
        body: formData,
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.secure_url) {
            // console.log("usrl ", data.secure_url);

            resolve(data.secure_url);
          } else {
            reject(new Error("Failed to get secure URL from Cloudinary"));
          }
        })
        .catch((error) => {
          reject(error);
        });
    });
  };

  //Fetch PDF from Cloudinary
  const fetchPdfsFromCloudinary = async () => {
    try {
      const response = await axios.get(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/search`,
        {
          params: { prefix: FOLDER_NAME },
          auth: { username: API_KEY, password: API_SECRET },
        }
      );
      console.log("fetch response ", response.data.resources);
      // Filter PDFs only
      const pdfs = response.data.resources.filter(
        (file) => file.format === "pdf"
      );

      if (pdfs.length > 0) {
        const pdfUrl = pdfs[0].secure_url; // Use the first PDF's URL
        console.log("pdfUrl ", pdfUrl);

        // loadPdfFromUrl(pdfUrl);
      } else {
        console.log("No PDFs found in Cloudinary.");
      }
    } catch (error) {
      console.error("Error fetching PDFs:", error);
    }
  };
  fetchPdfsFromCloudinary();
  // Function to handle page turn
  const handlePageTurn = useCallback(
    (currentPageIndex) => {
      setCurrentPageIndex(currentPageIndex);

      // Calculate the visible page indices based on the current display
      const pageIndices = [currentPageIndex * 2, currentPageIndex * 2 + 1];

      // Also preload the next and previous pages for smoother experience
      if (currentPageIndex > 0) {
        pageIndices.push((currentPageIndex - 1) * 2);
        pageIndices.push((currentPageIndex - 1) * 2 + 1);
      }

      if (currentPageIndex < Math.ceil(totalPages / 2) - 1) {
        pageIndices.push((currentPageIndex + 1) * 2);
        pageIndices.push((currentPageIndex + 1) * 2 + 1);
      }

      setVisiblePageIndices(
        pageIndices.filter((i) => i >= 0 && i < totalPages)
      );
    },
    [totalPages]
  );

  // Clear storage and reset state
  const handleReset = () => {
    localStorage.removeItem("pdfId");
    localStorage.removeItem("pdfFileName");
    localStorage.removeItem("pdfCloudinaryUrl");
    localStorage.removeItem("pdfTotalPages");

    setSelectedFile(null);
    setPdfDocument(null);
    setRenderedPages([]);
    setIsLoading(false);
    setLoadingProgress(0);
    setFullscreen(false);
    setZoomLevel(1);
    setFileName("");
    setStoredPdfId("");
    setCloudinaryUrl("");
    setTotalPages(0);
    setCurrentPageIndex(0);
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
      {/* Upload section */}
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

      {/* Loader */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center w-full h-[300px] bg-white rounded-lg shadow-md p-6">
          <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 mb-2">
            {loadingProgress < 50 ? "Uploading PDF..." : "Processing PDF..."}
            {" " + loadingProgress}%
          </p>
          <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* FlipBook */}
      {pdfDocument && !isLoading && (
        <>
          <div className="relative w-full h-full flex flex-col">
            {/* Top bar with file name and exit button */}
            <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center p-4 bg-black bg-opacity-50">
              <div className="flex items-center">
                <p className="text-white truncate max-w-md">{fileName}</p>
                <span className="text-gray-300 ml-2">
                  {Math.min(currentPageIndex * 2 + 1, totalPages)}-
                  {Math.min(currentPageIndex * 2 + 2, totalPages)} of{" "}
                  {totalPages}
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

            {/* FlipBook */}
            <div className="flex-1 w-full h-full">
              <FlipPage
                ref={flipPageRef}
                width={window.innerWidth}
                height={window.innerHeight}
                orientation="horizontal"
                uncutPages={true}
                flipOnTouch={true}
                animationDuration={400} // Slightly faster animation
                className="flipbook-container"
                showSwipeHint={true}
                onPageChange={handlePageTurn}
                maxAngle={25} // Lower angle for better performance
              >
                {Array.from({ length: Math.ceil(totalPages / 2) }).map(
                  (_, index) => (
                    <div
                      key={index}
                      className="page flex h-full w-full"
                      style={{
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: "center center",
                      }}
                    >
                      {/* Left page */}
                      {index * 2 < totalPages && (
                        <div className="w-1/2 h-full bg-white flex items-center justify-center">
                          {renderedPages[index * 2] ? (
                            <img
                              src={renderedPages[index * 2]}
                              alt={`Page ${index * 2 + 1}`}
                              className="w-full h-full object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <div className="animate-pulse flex items-center justify-center w-full h-full bg-gray-200">
                              <p className="text-gray-500">
                                Loading page {index * 2 + 1}...
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Right page */}
                      {index * 2 + 1 < totalPages ? (
                        <div className="w-1/2 h-full bg-white flex items-center justify-center">
                          {renderedPages[index * 2 + 1] ? (
                            <img
                              src={renderedPages[index * 2 + 1]}
                              alt={`Page ${index * 2 + 2}`}
                              className="w-full h-full object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <div className="animate-pulse flex items-center justify-center w-full h-full bg-gray-200">
                              <p className="text-gray-500">
                                Loading page {index * 2 + 2}...
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-1/2 h-full bg-gray-100 flex items-center justify-center">
                          <p className="text-gray-400">End of document</p>
                        </div>
                      )}
                    </div>
                  )
                )}
              </FlipPage>
            </div>

            {/* Controls */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 flex items-center space-x-2 bg-black bg-opacity-50 p-2 rounded-full">
              {/* Previous page button */}
              <button
                onClick={() => {
                  if (flipPageRef.current && currentPageIndex > 0) {
                    flipPageRef.current.gotoPreviousPage();
                  }
                }}
                disabled={currentPageIndex === 0}
                className={`p-2 rounded-full ${
                  currentPageIndex === 0
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                } transition`}
                aria-label="Previous page"
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
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              {/* Zoom controls */}
              <button
                onClick={zoomOut}
                disabled={zoomLevel <= 0.5}
                className={`p-2 rounded-full ${
                  zoomLevel <= 0.5
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                } transition`}
                aria-label="Zoom out"
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
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              <button
                onClick={resetZoom}
                className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition"
                aria-label="Reset zoom"
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
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>

              <button
                onClick={zoomIn}
                disabled={zoomLevel >= 3}
                className={`p-2 rounded-full ${
                  zoomLevel >= 3
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                } transition`}
                aria-label="Zoom in"
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
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              {/* Next page button */}
              <button
                onClick={() => {
                  if (
                    flipPageRef.current &&
                    currentPageIndex < Math.ceil(totalPages / 2) - 1
                  ) {
                    flipPageRef.current.gotoNextPage();
                  }
                }}
                disabled={currentPageIndex >= Math.ceil(totalPages / 2) - 1}
                className={`p-2 rounded-full ${
                  currentPageIndex >= Math.ceil(totalPages / 2) - 1
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                } transition`}
                aria-label="Next page"
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
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      {!fullscreen && !isLoading && (
        <div className="mt-4 text-center text-gray-500 text-sm">
          <p>
            Upload your PDF to view it as an interactive flipbook. Your PDF will
            be stored in your browser for future sessions.
          </p>
        </div>
      )}
    </div>
  );
};

export default FlipBook;
