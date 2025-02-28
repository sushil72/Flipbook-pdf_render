import React, { useState } from "react";
import FlipPage from "react-flip-page";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

// Set PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const FlipBook = () => {
  const [pages, setPages] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
      await loadPDF(file);
    } else {
      alert("Please select a valid PDF file.");
    }
  };

  const loadPDF = async (file) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = async (e) => {
      const pdfData = new Uint8Array(e.target.result);
      const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
      const numPages = pdf.numPages;
      const loadedPages = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport }).promise;
        loadedPages.push(canvas.toDataURL("image/png"));
      }

      setPages(loadedPages);
    };
  };

  const handleNext = () => {
    if (currentPage < pages.length - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrev = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-200 p-4">
      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="mb-4 p-2 border border-gray-300 rounded"
      />

      {pages.length > 0 ? (
        <div className="relative w-[700px] h-[900px] bg-white shadow-lg">
          <FlipPage
            width={700}
            height={900}
            orientation="horizontal"
            uncutPages={true}
            flipOnTouch={true}
            animationDuration={600}
          >
            {pages.map((src, index) => (
              <div
                key={index}
                className="page flex items-center justify-center"
              >
                <img
                  src={src}
                  alt={`Page ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </FlipPage>
          <div className="absolute bottom-4 left-0 right-0 flex justify-between px-4">
            <button
              onClick={handlePrev}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow"
              disabled={currentPage === 0}
            >
              Previous
            </button>
            <button
              onClick={handleNext}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow"
              disabled={currentPage === pages.length - 1}
            >
              Next
            </button>
          </div>
        </div>
      ) : (
        <p className="text-gray-600">Upload a PDF to see the flipbook.</p>
      )}
    </div>
  );
};

export default FlipBook;
