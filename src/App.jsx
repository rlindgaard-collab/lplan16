import { useState, useEffect } from "react";
import { jsPDF } from "jspdf";

// Hent pdfjs direkte fra CDN
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs";

// Fortæl pdfjs hvor worker ligger
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs`;

function App() {
  const SUPABASE_URL =
    "https://fjwpfesqfwtozaciphnc.supabase.co/functions/v1";

  // Global CSS reset
  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.backgroundColor = "#004250";
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('SW registered: ', registration);
          })
          .catch((registrationError) => {
            console.log('SW registration failed: ', registrationError);
          });
      });
    }
  }, []);

  const [summary, setSummary] = useState("");
  const [profile, setProfile] = useState("");
  const [kompetenceData, setKompetenceData] = useState({});
  const [goals, setGoals] = useState({});
  const [suggestion, setSuggestion] = useState("");
  const [activities, setActivities] = useState(
    JSON.parse(localStorage.getItem("activities") || "[]")
  );
  const [activeTab, setActiveTab] = useState(0);

  // Loading states
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  // Tab colors for activities
  const tabColors = [
    { bg: '#3b82f6', hover: '#2563eb', text: '#ffffff' }, // Blue
    { bg: '#10b981', hover: '#059669', text: '#ffffff' }, // Green
    { bg: '#f59e0b', hover: '#d97706', text: '#ffffff' }, // Amber
    { bg: '#ef4444', hover: '#dc2626', text: '#ffffff' }, // Red
    { bg: '#8b5cf6', hover: '#7c3aed', text: '#ffffff' }, // Purple
  ];

  // Get activity title from JSON or fallback
  const getActivityTitle = (activity) => {
    try {
      const jsonData = JSON.parse(activity.text);
      if (jsonData.title) {
        return jsonData.title;
      }
    } catch (e) {
      // Not JSON, try to extract first line as title
      const firstLine = activity.text.split('\n')[0];
      if (firstLine && firstLine.length < 100) {
        return firstLine.replace(/^\d+\.|\*\*|#/g, '').trim();
      }
    }
    return `Aktivitet ${activities.indexOf(activity) + 1}`;
  };
  // Hent kompetencemål.json
  useEffect(() => {
    fetch("kompetencemal.json")
      .then((res) => res.json())
      .then((data) => setKompetenceData(data));
  }, []);

  // Gem aktiviteter i localStorage
  useEffect(() => {
    localStorage.setItem("activities", JSON.stringify(activities));
  }, [activities]);

  // Reset active tab if activities change
  useEffect(() => {
    if (activities.length === 0) {
      setActiveTab(0);
    } else if (activeTab >= activities.length) {
      setActiveTab(activities.length - 1);
    }
  }, [activities.length]);
  // Upload & parse PDF i browseren
  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setLoadingPdf(true);
    setSummary("");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str).join(" ");
        text += pageText + "\n";
      }

      setLoadingPdf(false);
      setLoadingSummary(true);

      // Send ren tekst til opsummering function
      const res = await fetch(`${SUPABASE_URL}/opsummering`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      setSummary(data.summary || "");
    } catch (err) {
      console.error("Fejl ved upload:", err);
      alert("Kunne ikke læse PDF");
    } finally {
      setLoadingPdf(false);
      setLoadingSummary(false);
    }
  };

  // Skift praktikprofil → vis mål
  const handleProfileChange = (e) => {
    const selected = e.target.value;
    setProfile(selected);
    setGoals(kompetenceData[selected] || {});
  };

  // Lav forslag → forslag-function
  const handleSuggestion = async () => {
    if (!summary) {
      alert("Upload først en PDF, så vi har et resumé at arbejde med.");
      return;
    }

    setLoadingSuggestion(true);
    try {
      const combinedText = `
Resumé:
${summary}

Kompetencemål:
${Array.isArray(goals["kompetencemål"])
  ? goals["kompetencemål"].join("\n")
  : goals["kompetencemål"] || ""}

Vidensmål:
${(goals["vidensmål"] || []).join("\n")}

Færdighedsmål:
${(goals["færdighedsmål"] || []).join("\n")}
`;

      const res = await fetch(`${SUPABASE_URL}/forslag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: combinedText, profile }),
      });

      const data = await res.json();
      setSuggestion(data.suggestion || "Intet forslag modtaget");
    } catch (err) {
      console.error("Fejl ved forslag:", err);
      alert("Kunne ikke generere forslag");
    } finally {
      setLoadingSuggestion(false);
    }
  };

  // Gem aktivitet (max 3)
  const saveActivity = () => {
    if (!suggestion) {
      alert("Der er intet forslag at gemme.");
      return;
    }
    if (activities.length >= 4) {
      alert("Du kan kun gemme op til 4 aktiviteter.");
      return;
    }
    setActivities([...activities, { text: suggestion, reflection: "" }]);
    setSaveMessage("✅ Aktivitet gemt!");
    setTimeout(() => setSaveMessage(""), 3000);
  };

  // Opdater refleksion
  const updateReflection = (index, value) => {
    const newActs = [...activities];
    newActs[index].reflection = value;
    setActivities(newActs);
  };

  // Slet aktivitet
  const deleteActivity = (index) => {
    const newActs = activities.filter((_, i) => i !== index);
    setActivities(newActs);
  };

  // Udskriv til PDF
  const downloadPDF = () => {
    const doc = new jsPDF();
    
    // Setup constants
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    const headerHeight = 100;
    const footerHeight = 50;
    const maxContentHeight = pageHeight - headerHeight - footerHeight;
    
    let yPosition = headerHeight + 20;
    
    // Helper function to check if content fits on current page
    const checkPageBreak = (requiredHeight) => {
      if (yPosition + requiredHeight > pageHeight - footerHeight) {
        doc.addPage();
        addHeader();
        yPosition = headerHeight + 20;
      }
    };
    
    // Helper function to add header to each page
    const addHeader = () => {
      // Blue header background
      doc.setFillColor(59, 130, 246); // Blue
      doc.rect(0, 0, pageWidth, headerHeight - 15, 'F');
      
      // Header text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(255, 255, 255); // White
      doc.text('Mine Praktikaktiviteter', margin, 30);
      
      // Date
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Genereret: ${new Date().toLocaleDateString('da-DK')}`, pageWidth - 100, 30);
    };
    
    // Helper function to add footer
    const addFooter = (pageNum, totalPages) => {
      // Footer line
      doc.setLineWidth(1);
      doc.setDrawColor(209, 213, 219); // Gray
      doc.line(margin, pageHeight - 35, pageWidth - margin, pageHeight - 35);
      
      // Page number
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128); // Gray
      doc.text(`Side ${pageNum}`, margin, pageHeight - 20);
    };
    
    // Add header to first page
    addHeader();
    doc.setTextColor(0, 0, 0);
    yPosition = 50;
    
    activities.forEach((act, idx) => {
      // Check space for activity header (about 60 units)
      checkPageBreak(60);
      
      // Aktivitet overskrift med farvet baggrund
      doc.setFillColor(236, 72, 153); // Pink farve
      doc.rect(margin, yPosition - 10, maxWidth, 35, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`Aktivitet ${idx + 1}`, margin + 5, yPosition + 5);
      doc.setTextColor(0, 0, 0);
      yPosition += 20;
      
      // Parse JSON indhold hvis muligt
      try {
        const jsonData = JSON.parse(act.text);
        
        // Titel
        if (jsonData.title) {
          checkPageBreak(30); // Check space for title
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.setTextColor(31, 41, 55);
          const titleLines = doc.splitTextToSize(`Titel: ${jsonData.title}`, maxWidth);
          doc.text(titleLines, margin, yPosition);
          yPosition += titleLines.length * 7 + 10;
        }
        
        // Formål og læringsmål
        if (jsonData.goals) {
          const goalsHeight = Array.isArray(jsonData.goals) ? jsonData.goals.length * 15 + 50 : 70;
          checkPageBreak(goalsHeight);
          
          // Grøn baggrund til formål
          doc.setFillColor(16, 185, 129); // Grøn farve
          doc.rect(margin, yPosition - 5, maxWidth, 30, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.text('Formål og læringsmål:', margin + 9, yPosition + 12);
          yPosition += 35;
          
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          const goals = Array.isArray(jsonData.goals) ? jsonData.goals : [jsonData.goals];
          goals.forEach((goal, goalIdx) => {
            const goalText = `• ${goal}`;
            checkPageBreak(15); // Check for each line
            const goalLines = doc.splitTextToSize(goalText, maxWidth - 10);
            doc.text(goalLines, margin + 5, yPosition);
            yPosition += goalLines.length * 5 + 3;
          });
          yPosition += 5;
        }
        
        // Trin-for-trin gennemførelse
        if (jsonData.steps) {
          const stepsHeight = Array.isArray(jsonData.steps) ? jsonData.steps.length * 20 + 50 : 90;
          checkPageBreak(stepsHeight);
          
          // Grøn baggrund til trin
          doc.setFillColor(16, 185, 129); // Grøn farve
          doc.rect(margin, yPosition - 5, maxWidth, 30, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.text('Trin-for-trin gennemførelse:', margin + 9, yPosition + 12);
          yPosition += 35;
          
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          const steps = Array.isArray(jsonData.steps) ? jsonData.steps : [jsonData.steps];
          steps.forEach((step, stepIdx) => {
            const stepText = `${stepIdx + 1}. ${step}`;
            checkPageBreak(15);
            const stepLines = doc.splitTextToSize(stepText, maxWidth - 10);
            doc.text(stepLines, margin + 5, yPosition);
            yPosition += stepLines.length * 5 + 4;
          });
          yPosition += 5;
        }
        
        // Refleksion struktur
        if (jsonData.reflection) {
          checkPageBreak(150); // Reserve space for reflection section
          doc.setFillColor(139, 92, 246); // Lilla farve
          doc.rect(margin, yPosition - 5, maxWidth, 30, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.text('Refleksion:', margin + 9, yPosition + 12);
          yPosition += 40;
          
          // Refleksions-sektioner med grå baggrund
          const reflectionSections = ['oplevelse', 'refleksion', 'teori', 'handling'];
          const sectionTitles = ['Oplevelse', 'Refleksion', 'Teori', 'Handling'];
          
          reflectionSections.forEach((section, sectionIdx) => {
            if (jsonData.reflection[section]) {
              if (yPosition > pageHeight - 100) {
                doc.addPage();
                doc.setFillColor(59, 130, 246);
                doc.rect(0, 0, pageWidth, 35, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(18);
                doc.text('Mine Praktikaktiviteter', margin, 22);
                doc.setFontSize(10);
                const dateText = `Genereret: ${new Date().toLocaleDateString('da-DK')}`;
                doc.text(dateText, pageWidth - margin - doc.getTextWidth(dateText), 22);
                doc.setTextColor(0, 0, 0);
                yPosition = 50;
              }
              
              checkPageBreak(70); // Check space for each reflection section
              
              // Grå baggrund til refleksions-sektion
              const sectionHeight = Math.max(60, Math.ceil(jsonData.reflection[section].length / 80) * 15 + 25);
              doc.setFillColor(243, 244, 246);
              doc.rect(margin, yPosition - 3, maxWidth, sectionHeight, 'F');
              
              doc.setFont("helvetica", "bold");
              doc.setFontSize(11);
              doc.setTextColor(75, 85, 99);
              doc.text(sectionTitles[sectionIdx], margin + 9, yPosition + 12);
              
              let sectionY = yPosition + 25;
              doc.setFont("helvetica", "normal");
              doc.setFontSize(10);
              doc.setTextColor(55, 65, 81);
              const sectionLines = doc.splitTextToSize(jsonData.reflection[section], maxWidth - 10);
              doc.text(sectionLines, margin + 5, sectionY);
              yPosition += sectionHeight + 5;
            }
          });
        }
        
      } catch (e) {
        checkPageBreak(80);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const activityLines = doc.splitTextToSize(act.text, maxWidth);
        doc.text(activityLines, margin, yPosition);
        yPosition += activityLines.length * 5 + 10;
      }
      
      checkPageBreak(70);
      
      // Mine refleksioner sektion med gul baggrund
      doc.setFillColor(254, 240, 138); // Gul farve
      doc.rect(margin, yPosition - 5, maxWidth, 30, 'F');
      doc.setTextColor(146, 64, 14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text('Mine refleksioner:', margin + 9, yPosition + 12);
      yPosition += 35;
      
      // Refleksioner indhold
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const reflectionText = act.reflection || "Ingen refleksioner tilføjet endnu.";
      const reflectionLines = doc.splitTextToSize(reflectionText, maxWidth - 10);
      reflectionLines.forEach(line => {
        checkPageBreak(15);
        doc.text(line, margin + 5, yPosition);
        yPosition += 5;
      });
      yPosition += 20;
      
      // Separator linje mellem aktiviteter (undtagen efter sidste)
      if (idx < activities.length - 1) {
        checkPageBreak(25);
        doc.setLineWidth(0.5);
        doc.setDrawColor(209, 213, 219);
        doc.line(margin, yPosition - 10, pageWidth - margin, yPosition - 10);
        yPosition += 5;
      }
    });
    
    // Add footers to all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      addFooter(i, totalPages);
    }
    
    doc.save(`praktikaktiviteter_${new Date().toLocaleDateString('da-DK').replace(/\./g, '-')}.pdf`);
  };

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: window.innerWidth <= 1024 ? "column" : "row",
      fontFamily: "sans-serif",
      minHeight: "100vh",
      backgroundColor: "#004250",
      margin: 0,
      padding: 0,
      gap: window.innerWidth <= 1024 ? "0" : "20px"
    }}>
      {/* Venstre side */}
      <div style={{ 
        flex: 1, 
        padding: window.innerWidth <= 768 ? "15px" : window.innerWidth <= 1024 ? "20px" : "20px",
        maxWidth: window.innerWidth <= 1024 ? "100%" : "50%"
      }}>
        <h1 style={{
          color: "#ffffff",
          fontSize: window.innerWidth <= 480 ? "20px" : window.innerWidth <= 768 ? "24px" : "32px",
          marginBottom: window.innerWidth <= 768 ? "15px" : "20px",
          fontWeight: "600",
          fontFamily: "Montserrat, sans-serif",
          textAlign: window.innerWidth <= 768 ? "center" : "left"
        }}>Læringsassistent</h1>

        <div style={{ 
          marginBottom: window.innerWidth <= 768 ? "15px" : "20px", 
          background: "#fff", 
          padding: window.innerWidth <= 480 ? "12px" : window.innerWidth <= 768 ? "15px" : "15px", 
          borderRadius: "10px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          border: "1px solid #e5e7eb"
        }}>
          <input 
            type="file" 
            accept="application/pdf" 
            onChange={handlePdfUpload}
            style={{ display: "none" }}
            id="pdf-upload"
          />
          <label 
            htmlFor="pdf-upload"
            style={{
              display: "inline-block",
              padding: window.innerWidth <= 480 ? "14px 18px" : window.innerWidth <= 768 ? "12px 16px" : "10px 20px",
              backgroundColor: "#000000",
              color: "white",
              borderRadius: "5px",
              cursor: "pointer",
              border: "none",
              fontSize: window.innerWidth <= 480 ? "16px" : window.innerWidth <= 768 ? "14px" : "16px",
              width: window.innerWidth <= 1024 ? "100%" : "auto",
              textAlign: "center",
              transition: "background-color 0.2s ease",
              fontWeight: "500"
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = "#333333"}
            onMouseLeave={(e) => e.target.style.backgroundColor = "#000000"}
          >
            Upload PDF
          </label>
          {uploadedFileName && !loadingPdf && !loadingSummary && (
            <p style={{ 
              marginTop: "10px", 
              color: "#374151", 
              fontSize: window.innerWidth <= 480 ? "13px" : "14px",
              fontStyle: "italic",
              wordBreak: "break-all"
            }}>
              📄 Uploadet fil: {uploadedFileName}
            </p>
          )}
          {loadingPdf && <p style={{ 
            marginTop: "10px", 
            color: "#374151", 
            fontSize: window.innerWidth <= 480 ? "14px" : "16px" 
          }}>📄 Indlæser PDF...</p>}
          {loadingSummary && <p style={{ 
            marginTop: "10px", 
            color: "#374151", 
            fontSize: window.innerWidth <= 480 ? "14px" : "16px" 
          }}>✨ Opsummerer læreplan...</p>}
        </div>

        <div style={{ 
          marginBottom: window.innerWidth <= 768 ? "15px" : "20px", 
          background: "#fff", 
          padding: window.innerWidth <= 480 ? "12px" : window.innerWidth <= 768 ? "15px" : "15px", 
          borderRadius: "10px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          border: "1px solid #e5e7eb"
        }}>
          <h2 style={{
            color: "#374151",
            fontSize: window.innerWidth <= 480 ? "16px" : window.innerWidth <= 768 ? "18px" : "20px",
            marginBottom: window.innerWidth <= 768 ? "12px" : "15px",
            fontWeight: "600",
            fontFamily: "Montserrat, sans-serif"
          }}>Mine aktiviteter (max 4)</h2>
          
          {activities.length > 0 ? (
            <div>
              {/* Tab Headers */}
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
                borderBottom: "2px solid #e5e7eb"
              }}>
                {activities.map((act, idx) => {
                  const isActive = idx === activeTab;
                  const color = tabColors[idx % tabColors.length];
                  return (
                    <button
                      key={idx}
                      onClick={() => setActiveTab(idx)}
                      style={{
                        padding: window.innerWidth <= 480 ? "8px 12px" : "10px 16px",
                        backgroundColor: isActive ? color.bg : "#f3f4f6",
                        color: isActive ? color.text : "#374151",
                        border: "none",
                        borderRadius: "8px 8px 0 0",
                        cursor: "pointer",
                        fontSize: window.innerWidth <= 480 ? "12px" : "14px",
                        fontWeight: "600",
                        fontFamily: "Montserrat, sans-serif",
                        transition: "all 0.2s ease",
                        maxWidth: window.innerWidth <= 480 ? "120px" : "200px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: isActive ? "0" : "2px",
                        transform: isActive ? "translateY(2px)" : "none",
                        boxShadow: isActive ? "0 2px 4px rgba(0,0,0,0.1)" : "none"
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.target.style.backgroundColor = "#f3f4f6";
                        }
                      }}
                    >
                      {getActivityTitle(act)}
                    </button>
                  );
                })}
              </div>

              {/* Active Tab Content */}
              {activities[activeTab] && (
                <div style={{
                  border: "1px solid #d1d5db",
                  borderTop: "none",
                  padding: window.innerWidth <= 480 ? "12px" : "16px",
                  borderRadius: "0 0 8px 8px",
                  backgroundColor: "#f9fafb",
                  minHeight: "200px"
                }}>
                  {/* Activity Content */}
                  <div style={{ 
                    color: "#4b5563", 
                    lineHeight: "1.5", 
                    fontSize: window.innerWidth <= 480 ? "14px" : "15px",
                    marginBottom: "10px"
                  }}>
                    {(() => {
                      // Try to parse as JSON first
                      try {
                        const jsonData = JSON.parse(activities[activeTab].text);
                        if (jsonData.title || jsonData.goals || jsonData.steps || jsonData.reflection) {
                          return (
                            <div style={{ whiteSpace: "normal", wordWrap: "break-word" }}>
                              {/* Title */}
                              {jsonData.title && (
                                <h3 style={{
                                  fontWeight: "700",
                                  color: "#1f2937",
                                  marginBottom: "12px",
                                  fontSize: window.innerWidth <= 480 ? "16px" : "18px",
                                  fontFamily: "Montserrat, sans-serif"
                                }}>
                                  {jsonData.title}
                                </h3>
                              )}
                              
                              {/* Goals */}
                              {jsonData.goals && (
                                <div style={{ marginBottom: "16px" }}>
                                  <h4 style={{
                                    fontWeight: "600",
                                    color: "#374151",
                                    marginBottom: "6px",
                                    fontSize: window.innerWidth <= 480 ? "14px" : "16px",
                                    fontFamily: "Montserrat, sans-serif"
                                  }}>
                                    Formål og læringsmål
                                  </h4>
                                  <ul style={{
                                    paddingLeft: "16px",
                                    margin: "0",
                                    lineHeight: "1.5",
                                    fontSize: window.innerWidth <= 480 ? "13px" : "14px"
                                  }}>
                                    {Array.isArray(jsonData.goals) 
                                      ? jsonData.goals.map((goal, goalIdx) => (
                                          <li key={goalIdx} style={{ marginBottom: "3px" }}>{goal}</li>
                                        ))
                                      : <li>{jsonData.goals}</li>
                                    }
                                  </ul>
                                </div>
                              )}
                              
                              {/* Steps */}
                              {jsonData.steps && (
                                <div style={{ marginBottom: "16px" }}>
                                  <h4 style={{
                                    fontWeight: "600",
                                    color: "#374151",
                                    marginBottom: "6px",
                                    fontSize: window.innerWidth <= 480 ? "14px" : "16px",
                                    fontFamily: "Montserrat, sans-serif"
                                  }}>
                                    Trin-for-trin gennemførelse
                                  </h4>
                                  <ol style={{
                                    paddingLeft: "16px",
                                    margin: "0",
                                    lineHeight: "1.5",
                                    fontSize: window.innerWidth <= 480 ? "13px" : "14px"
                                  }}>
                                    {Array.isArray(jsonData.steps) 
                                      ? jsonData.steps.map((step, stepIdx) => (
                                          <li key={stepIdx} style={{ marginBottom: "4px" }}>{step}</li>
                                        ))
                                      : <li>{jsonData.steps}</li>
                                    }
                                  </ol>
                                </div>
                              )}
                              
                              {/* Reflection */}
                              {jsonData.reflection && (
                                <div style={{ marginBottom: "16px" }}>
                                  <h4 style={{
                                    fontWeight: "600",
                                    color: "#374151",
                                    marginBottom: "8px",
                                    fontSize: window.innerWidth <= 480 ? "14px" : "16px",
                                    fontFamily: "Montserrat, sans-serif"
                                  }}>
                                    Refleksion
                                  </h4>
                                  
                                  {/* Oplevelse */}
                                  {jsonData.reflection.oplevelse && (
                                    <div style={{ marginBottom: "8px" }}>
                                      <h5 style={{
                                        fontWeight: "600",
                                        color: "#4b5563",
                                        marginBottom: "3px",
                                        fontSize: window.innerWidth <= 480 ? "12px" : "14px"
                                      }}>
                                        Oplevelse
                                      </h5>
                                      <p style={{ margin: "0", lineHeight: "1.4", color: "#374151", fontSize: window.innerWidth <= 480 ? "12px" : "13px" }}>
                                        {jsonData.reflection.oplevelse}
                                      </p>
                                    </div>
                                  )}
                                  
                                  {/* Refleksion */}
                                  {jsonData.reflection.refleksion && (
                                    <div style={{ marginBottom: "8px" }}>
                                      <h5 style={{
                                        fontWeight: "600",
                                        color: "#4b5563",
                                        marginBottom: "3px",
                                        fontSize: window.innerWidth <= 480 ? "12px" : "14px"
                                      }}>
                                        Refleksion
                                      </h5>
                                      <p style={{ margin: "0", lineHeight: "1.4", color: "#374151", fontSize: window.innerWidth <= 480 ? "12px" : "13px" }}>
                                        {jsonData.reflection.refleksion}
                                      </p>
                                    </div>
                                  )}
                                  
                                  {/* Teori */}
                                  {jsonData.reflection.teori && (
                                    <div style={{ marginBottom: "8px" }}>
                                      <h5 style={{
                                        fontWeight: "600",
                                        color: "#4b5563",
                                        marginBottom: "3px",
                                        fontSize: window.innerWidth <= 480 ? "12px" : "14px"
                                      }}>
                                        Teori
                                      </h5>
                                      <p style={{ margin: "0", lineHeight: "1.4", color: "#374151", fontSize: window.innerWidth <= 480 ? "12px" : "13px" }}>
                                        {jsonData.reflection.teori}
                                      </p>
                                    </div>
                                  )}
                                  
                                  {/* Handling */}
                                  {jsonData.reflection.handling && (
                                    <div style={{ marginBottom: "8px" }}>
                                      <h5 style={{
                                        fontWeight: "600",
                                        color: "#4b5563",
                                        marginBottom: "3px",
                                        fontSize: window.innerWidth <= 480 ? "12px" : "14px"
                                      }}>
                                        Handling
                                      </h5>
                                      <p style={{ margin: "0", lineHeight: "1.4", color: "#374151", fontSize: window.innerWidth <= 480 ? "12px" : "13px" }}>
                                        {jsonData.reflection.handling}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }
                      } catch (e) {
                        // Not JSON, fall back to text formatting
                      }
                      
                      // Fallback to original text formatting
                      return (
                        <div style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
                          {activities[activeTab].text.split('\n').map((line, lineIdx) => {
                            // Check if line is a heading (starts with numbers or bullets)
                            const isHeading = /^(\d+\.|\*\*|#|•)/.test(line.trim());
                            const isBold = line.includes('**');
                            
                            if (isHeading || isBold) {
                              return (
                                <div key={lineIdx} style={{
                                  fontWeight: "600",
                                  color: "#1f2937",
                                  marginTop: lineIdx > 0 ? "8px" : "0",
                                  marginBottom: "4px",
                                  fontSize: window.innerWidth <= 480 ? "13px" : "14px"
                                }}>
                                  {line.replace(/\*\*/g, '')}
                                </div>
                              );
                            }
                            
                            // Regular paragraph
                            if (line.trim()) {
                              return (
                                <div key={lineIdx} style={{
                                  marginBottom: "6px",
                                  lineHeight: "1.5"
                                }}>
                                  {line}
                                </div>
                              );
                            }
                            
                            // Empty line for spacing
                            return <div key={lineIdx} style={{ height: "4px" }} />;
                          })}
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* Reflection Textarea */}
                  <textarea
                    placeholder="Skriv dine refleksioner..."
                    value={activities[activeTab].reflection}
                    onChange={(e) => updateReflection(activeTab, e.target.value)}
                    style={{ 
                      width: "100%", 
                      marginBottom: window.innerWidth <= 768 ? "12px" : "10px",
                      minHeight: window.innerWidth <= 480 ? "80px" : window.innerWidth <= 768 ? "70px" : "80px",
                      padding: window.innerWidth <= 480 ? "10px" : "8px",
                      borderRadius: "4px",
                      border: "1px solid #d1d5db",
                      fontSize: window.innerWidth <= 480 ? "16px" : "14px",
                      fontFamily: "inherit",
                      resize: "vertical"
                    }}
                  />
                  
                  {/* Delete Button */}
                  <button 
                    onClick={() => deleteActivity(activeTab)}
                    style={{
                      padding: window.innerWidth <= 480 ? "10px 16px" : "6px 12px",
                      backgroundColor: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      transition: "background-color 0.2s ease",
                      fontSize: window.innerWidth <= 480 ? "14px" : "13px",
                      fontWeight: "500"
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = "#dc2626"}
                    onMouseLeave={(e) => e.target.style.backgroundColor = "#ef4444"}
                  >
                    Slet
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "#6b7280",
              fontStyle: "italic"
            }}>
              Ingen aktiviteter gemt endnu. Lav et forslag og gem det for at komme i gang.
            </div>
          )}
          
          <button 
            onClick={downloadPDF}
            disabled={activities.length === 0}
            style={{
              padding: window.innerWidth <= 480 ? "14px 18px" : window.innerWidth <= 768 ? "12px 16px" : "10px 20px",
              backgroundColor: activities.length === 0 ? "#9ca3af" : "#000000",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: activities.length === 0 ? "not-allowed" : "pointer",
              width: window.innerWidth <= 1024 ? "100%" : "auto",
              fontSize: window.innerWidth <= 480 ? "16px" : window.innerWidth <= 768 ? "14px" : "16px",
              transition: "background-color 0.2s ease",
              fontWeight: "500",
              marginTop: "15px"
            }}
            onMouseEnter={(e) => {
              if (activities.length > 0) {
                e.target.style.backgroundColor = "#333333";
              }
            }}
            onMouseLeave={(e) => {
              if (activities.length > 0) {
                e.target.style.backgroundColor = "#000000";
              } else {
                e.target.style.backgroundColor = "#9ca3af";
              }
            }}
          >
            Udskriv alle aktiviteter
          </button>
        </div>
      </div>

      {/* Højre side */}
      <div style={{ 
        flex: 1, 
        padding: window.innerWidth <= 768 ? "15px" : window.innerWidth <= 1024 ? "20px" : "20px",
        maxWidth: window.innerWidth <= 1024 ? "100%" : "50%"
      }}>
        <div style={{ 
          marginBottom: window.innerWidth <= 768 ? "15px" : "20px", 
          background: "#fff", 
          padding: window.innerWidth <= 480 ? "12px" : window.innerWidth <= 768 ? "15px" : "15px", 
          borderRadius: "10px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          border: "1px solid #e5e7eb"
        }}>
          <h2 style={{
            color: "#374151",
            fontSize: window.innerWidth <= 480 ? "16px" : window.innerWidth <= 768 ? "18px" : "20px",
            marginBottom: window.innerWidth <= 768 ? "12px" : "15px",
            fontWeight: "600",
            fontFamily: "Montserrat, sans-serif"
          }}>Opsummering af læreplan</h2>
          {loadingSummary ? (
            <p style={{ 
              color: "#6b7280", 
              fontSize: window.innerWidth <= 480 ? "14px" : "16px" 
            }}>✨ GPT arbejder...</p>
          ) : (
            <div style={{
              border: "1px solid #d1d5db",
              padding: window.innerWidth <= 480 ? "10px" : "12px",
              borderRadius: "8px",
              backgroundColor: "#f9fafb",
              whiteSpace: "pre-wrap",
              wordWrap: "break-word",
              maxHeight: window.innerWidth <= 480 ? "180px" : window.innerWidth <= 768 ? "200px" : "300px",
              overflowY: "auto",
              fontSize: window.innerWidth <= 480 ? "14px" : window.innerWidth <= 768 ? "13px" : "14px",
              lineHeight: "1.5",
              color: "#374151"
            }}>
              {summary || "Ingen opsummering endnu - upload en PDF for at komme i gang."}
            </div>
          )}
        </div>

        <div style={{ 
          marginBottom: window.innerWidth <= 768 ? "15px" : "20px", 
          background: "#fff", 
          padding: window.innerWidth <= 480 ? "12px" : window.innerWidth <= 768 ? "15px" : "15px", 
          borderRadius: "10px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          border: "1px solid #e5e7eb"
        }}>
          <h2 style={{
            color: "#374151",
            fontSize: window.innerWidth <= 480 ? "16px" : window.innerWidth <= 768 ? "18px" : "20px",
            marginBottom: window.innerWidth <= 768 ? "12px" : "15px",
            fontWeight: "600",
            fontFamily: "Montserrat, sans-serif"
          }}>Praktikprofil & mål</h2>
          <select 
            value={profile} 
            onChange={handleProfileChange}
            style={{
              width: "100%",
              padding: window.innerWidth <= 480 ? "12px" : "8px",
              marginBottom: window.innerWidth <= 768 ? "12px" : "10px",
              borderRadius: "4px",
              border: "1px solid #d1d5db",
              backgroundColor: "#fff",
              color: "#374151",
              fontSize: window.innerWidth <= 480 ? "16px" : window.innerWidth <= 768 ? "14px" : "16px"
            }}
          >
            <option value="">Vælg profil</option>
            {Object.keys(kompetenceData).map((key) => (
              <option key={key} value={key}>
                {key === "Dagtilbudspædagogik – 1. praktik" 
                  ? "1. praktik"
                  : key}
              </option>
            ))}
          </select>
          {profile && goals && (
            <div style={{
              border: "1px solid #d1d5db",
              padding: window.innerWidth <= 480 ? "10px" : "12px",
              borderRadius: "8px",
              backgroundColor: "#f9fafb",
              marginTop: window.innerWidth <= 768 ? "12px" : "10px"
            }}>
              <h3 style={{
                color: "#374151",
                fontSize: window.innerWidth <= 480 ? "15px" : window.innerWidth <= 768 ? "16px" : "18px",
                marginBottom: window.innerWidth <= 768 ? "8px" : "10px",
                fontWeight: "600",
                fontFamily: "Montserrat, sans-serif"
              }}>Kompetencemål</h3>
              <div style={{ marginBottom: window.innerWidth <= 768 ? "12px" : "15px" }}>
                {Array.isArray(goals["kompetencemål"])
                  ? goals["kompetencemål"].map((m, i) => {
                      // Check for different title patterns
                      // Pattern 1: "Pædagogens praksis De studerende..."
                      const praktikMatch = m.match(/^([^D]*)\s+(De studerende.*)/);
                      if (praktikMatch) {
                        let title = praktikMatch[1].trim();
                        // Remove "1. praktik: " prefix if it exists
                        title = title.replace(/^\d+\.\s*praktik:\s*/, '');
                        return (
                          <div key={i} style={{ marginBottom: "10px" }}>
                            <h4 style={{ 
                              margin: "0 0 5px 0", 
                              fontWeight: "600", 
                              color: "#374151", 
                              fontFamily: "Montserrat, sans-serif",
                              fontSize: window.innerWidth <= 480 ? "14px" : "16px"
                            }}>
                              {title}
                            </h4>
                            <p style={{ 
                              margin: "0", 
                              lineHeight: "1.5", 
                              color: "#374151",
                              fontSize: window.innerWidth <= 480 ? "13px" : "14px"
                            }}>{praktikMatch[2]}</p>
                          </div>
                        );
                      }
                      return <p key={i} style={{ 
                        margin: "0 0 10px 0", 
                        lineHeight: "1.5", 
                        color: "#374151",
                        fontSize: window.innerWidth <= 480 ? "13px" : "14px"
                      }}>{m}</p>;
                    })
                  : (() => {
                      const m = goals["kompetencemål"];
                      // Check for different title patterns
                      // Pattern 1: "Pædagogens praksis De studerende..."
                      const praktikMatch = m?.match(/^([^D]*)\s+(De studerende.*)/);
                      if (praktikMatch) {
                        let title = praktikMatch[1].trim();
                        // Remove "1. praktik: " prefix if it exists
                        title = title.replace(/^\d+\.\s*praktik:\s*/, '');
                        return (
                          <div style={{ marginBottom: "10px" }}>
                            <h4 style={{ 
                              margin: "0 0 5px 0", 
                              fontWeight: "600", 
                              color: "#374151", 
                              fontFamily: "Montserrat, sans-serif",
                              fontSize: window.innerWidth <= 480 ? "14px" : "16px"
                            }}>
                              {title}
                            </h4>
                            <p style={{ 
                              margin: "0", 
                              lineHeight: "1.5", 
                              color: "#374151",
                              fontSize: window.innerWidth <= 480 ? "13px" : "14px"
                            }}>{praktikMatch[2]}</p>
                          </div>
                        );
                      }
                      return <p style={{ 
                        margin: "0", 
                        lineHeight: "1.5", 
                        color: "#374151",
                        fontSize: window.innerWidth <= 480 ? "13px" : "14px"
                      }}>{m}</p>;
                    })()}
              </div>

              <h3 style={{
                color: "#374151",
                fontSize: window.innerWidth <= 480 ? "15px" : window.innerWidth <= 768 ? "16px" : "18px",
                marginBottom: window.innerWidth <= 768 ? "8px" : "10px",
                fontWeight: "600",
                fontFamily: "Montserrat, sans-serif"
              }}>Vidensmål</h3>
              <ul style={{ 
                color: "#374151", 
                lineHeight: "1.5",
                fontSize: window.innerWidth <= 480 ? "13px" : "14px",
                paddingLeft: window.innerWidth <= 480 ? "16px" : "20px"
              }}>
                {(goals["vidensmål"] || []).map((m, i) => <li key={i}>{m}</li>)}
              </ul>

              <h3 style={{
                color: "#374151",
                fontSize: window.innerWidth <= 480 ? "15px" : window.innerWidth <= 768 ? "16px" : "18px",
                marginBottom: window.innerWidth <= 768 ? "8px" : "10px",
                fontWeight: "600",
                fontFamily: "Montserrat, sans-serif"
              }}>Færdighedsmål</h3>
              <ul style={{ 
                color: "#374151", 
                lineHeight: "1.5",
                fontSize: window.innerWidth <= 480 ? "13px" : "14px",
                paddingLeft: window.innerWidth <= 480 ? "16px" : "20px"
              }}>
                {(goals["færdighedsmål"] || []).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div style={{ 
          background: "#fff", 
          padding: window.innerWidth <= 480 ? "12px" : window.innerWidth <= 768 ? "15px" : "15px", 
          borderRadius: "10px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          border: "1px solid #e5e7eb"
        }}>
          <h2 style={{
            color: "#374151",
            fontSize: window.innerWidth <= 480 ? "16px" : window.innerWidth <= 768 ? "18px" : "20px",
            marginBottom: window.innerWidth <= 768 ? "12px" : "15px",
            fontWeight: "600",
            fontFamily: "Montserrat, sans-serif"
          }}>Lav forslag til aktivitet</h2>
          <button 
            onClick={handleSuggestion} 
            disabled={loadingSuggestion}
            style={{
              padding: window.innerWidth <= 480 ? "14px 18px" : window.innerWidth <= 768 ? "12px 16px" : "10px 20px",
              backgroundColor: loadingSuggestion ? "#9ca3af" : "#000000",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: loadingSuggestion ? "not-allowed" : "pointer",
              width: window.innerWidth <= 1024 ? "100%" : "auto",
              fontSize: window.innerWidth <= 480 ? "16px" : window.innerWidth <= 768 ? "14px" : "16px",
              marginBottom: window.innerWidth <= 768 ? "12px" : "10px",
              transition: "background-color 0.2s ease",
              fontWeight: "500"
            }}
            onMouseEnter={(e) => {
              if (!loadingSuggestion) {
                e.target.style.backgroundColor = "#333333";
              }
            }}
            onMouseLeave={(e) => {
              if (!loadingSuggestion) {
                e.target.style.backgroundColor = "#000000";
              } else {
                e.target.style.backgroundColor = "#9ca3af";
              }
            }}
          >
            {loadingSuggestion ? "⏳ Genererer forslag..." : "Lav forslag"}
          </button>
          <div style={{
            border: "1px solid #d1d5db",
            padding: window.innerWidth <= 480 ? "10px" : "12px",
            borderRadius: "8px",
            backgroundColor: "#f9fafb",
            maxHeight: window.innerWidth <= 480 ? "180px" : window.innerWidth <= 768 ? "200px" : "300px",
            overflowY: "auto",
            fontSize: window.innerWidth <= 480 ? "14px" : window.innerWidth <= 768 ? "13px" : "14px",
            lineHeight: "1.5",
            marginTop: window.innerWidth <= 768 ? "12px" : "10px",
            marginBottom: window.innerWidth <= 768 ? "12px" : "10px",
            color: "#374151"
          }}>
            {suggestion ? (
              <div style={{ whiteSpace: "normal", wordWrap: "break-word" }}>
                {(() => {
                  // Try to parse as JSON first
                  try {
                    const jsonData = JSON.parse(suggestion);
                    if (jsonData.title || jsonData.goals || jsonData.steps || jsonData.reflection) {
                      return (
                        <div style={{ whiteSpace: "normal", wordWrap: "break-word" }}>
                          {/* Title */}
                          {jsonData.title && (
                            <h3 style={{
                              fontWeight: "700",
                              color: "#1f2937",
                              marginBottom: "16px",
                              fontSize: window.innerWidth <= 480 ? "18px" : "20px",
                              fontFamily: "Montserrat, sans-serif"
                            }}>
                              {jsonData.title}
                            </h3>
                          )}
                          
                          {/* Goals */}
                          {jsonData.goals && (
                            <div style={{ marginBottom: "20px" }}>
                              <h4 style={{
                                fontWeight: "600",
                                color: "#374151",
                                marginBottom: "8px",
                                fontSize: window.innerWidth <= 480 ? "16px" : "18px",
                                fontFamily: "Montserrat, sans-serif"
                              }}>
                                Formål og læringsmål
                              </h4>
                              <ul style={{
                                paddingLeft: "20px",
                                margin: "0",
                                lineHeight: "1.6"
                              }}>
                                {Array.isArray(jsonData.goals) 
                                  ? jsonData.goals.map((goal, idx) => (
                                      <li key={idx} style={{ marginBottom: "4px" }}>{goal}</li>
                                    ))
                                  : <li>{jsonData.goals}</li>
                                }
                              </ul>
                            </div>
                          )}
                          
                          {/* Steps */}
                          {jsonData.steps && (
                            <div style={{ marginBottom: "20px" }}>
                              <h4 style={{
                                fontWeight: "600",
                                color: "#374151",
                                marginBottom: "8px",
                                fontSize: window.innerWidth <= 480 ? "16px" : "18px",
                                fontFamily: "Montserrat, sans-serif"
                              }}>
                                Trin-for-trin gennemførelse
                              </h4>
                              <ol style={{
                                paddingLeft: "20px",
                                margin: "0",
                                lineHeight: "1.6"
                              }}>
                                {Array.isArray(jsonData.steps) 
                                  ? jsonData.steps.map((step, idx) => (
                                      <li key={idx} style={{ marginBottom: "6px" }}>{step}</li>
                                    ))
                                  : <li>{jsonData.steps}</li>
                                }
                              </ol>
                            </div>
                          )}
                          
                          {/* Reflection */}
                          {jsonData.reflection && (
                            <div style={{ marginBottom: "20px" }}>
                              <h4 style={{
                                fontWeight: "600",
                                color: "#374151",
                                marginBottom: "12px",
                                fontSize: window.innerWidth <= 480 ? "16px" : "18px",
                                fontFamily: "Montserrat, sans-serif"
                              }}>
                                Refleksion
                              </h4>
                              
                              {/* Oplevelse */}
                              {jsonData.reflection.oplevelse && (
                                <div style={{ marginBottom: "12px" }}>
                                  <h5 style={{
                                    fontWeight: "600",
                                    color: "#4b5563",
                                    marginBottom: "4px",
                                    fontSize: window.innerWidth <= 480 ? "14px" : "16px"
                                  }}>
                                    Oplevelse
                                  </h5>
                                  <p style={{ margin: "0", lineHeight: "1.5", color: "#374151" }}>
                                    {jsonData.reflection.oplevelse}
                                  </p>
                                </div>
                              )}
                              
                              {/* Refleksion */}
                              {jsonData.reflection.refleksion && (
                                <div style={{ marginBottom: "12px" }}>
                                  <h5 style={{
                                    fontWeight: "600",
                                    color: "#4b5563",
                                    marginBottom: "4px",
                                    fontSize: window.innerWidth <= 480 ? "14px" : "16px"
                                  }}>
                                    Refleksion
                                  </h5>
                                  <p style={{ margin: "0", lineHeight: "1.5", color: "#374151" }}>
                                    {jsonData.reflection.refleksion}
                                  </p>
                                </div>
                              )}
                              
                              {/* Teori */}
                              {jsonData.reflection.teori && (
                                <div style={{ marginBottom: "12px" }}>
                                  <h5 style={{
                                    fontWeight: "600",
                                    color: "#4b5563",
                                    marginBottom: "4px",
                                    fontSize: window.innerWidth <= 480 ? "14px" : "16px"
                                  }}>
                                    Teori
                                  </h5>
                                  <p style={{ margin: "0", lineHeight: "1.5", color: "#374151" }}>
                                    {jsonData.reflection.teori}
                                  </p>
                                </div>
                              )}
                              
                              {/* Handling */}
                              {jsonData.reflection.handling && (
                                <div style={{ marginBottom: "12px" }}>
                                  <h5 style={{
                                    fontWeight: "600",
                                    color: "#4b5563",
                                    marginBottom: "4px",
                                    fontSize: window.innerWidth <= 480 ? "14px" : "16px"
                                  }}>
                                    Handling
                                  </h5>
                                  <p style={{ margin: "0", lineHeight: "1.5", color: "#374151" }}>
                                    {jsonData.reflection.handling}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }
                  } catch (e) {
                    // Not JSON, fall back to text formatting
                  }
                  
                  // Fallback to original text formatting
                  return (
                    <div style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
                      {suggestion.split('\n').map((line, index) => {
                        // Check if line is a heading (starts with numbers or bullets)
                        const isHeading = /^(\d+\.|\*\*|#|•)/.test(line.trim());
                        const isBold = line.includes('**');
                        
                        if (isHeading || isBold) {
                          return (
                            <div key={index} style={{
                              fontWeight: "600",
                              color: "#1f2937",
                              marginTop: index > 0 ? "12px" : "0",
                              marginBottom: "6px",
                              fontSize: window.innerWidth <= 480 ? "15px" : "16px"
                            }}>
                              {line.replace(/\*\*/g, '')}
                            </div>
                          );
                        }
                        
                        // Regular paragraph
                        if (line.trim()) {
                          return (
                            <div key={index} style={{
                              marginBottom: "8px",
                              lineHeight: "1.6"
                            }}>
                              {line}
                            </div>
                          );
                        }
                        
                        // Empty line for spacing
                        return <div key={index} style={{ height: "8px" }} />;
                      })}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div style={{ 
                fontStyle: "italic", 
                color: "#6b7280",
                textAlign: "center",
                padding: "20px"
              }}>
                Klik på 'Lav forslag' for at få et aktivitetsforslag baseret på din læreplan og kompetencemål.
              </div>
            )}
          </div>
          <button 
            onClick={saveActivity}
            style={{
              padding: window.innerWidth <= 480 ? "14px 18px" : window.innerWidth <= 768 ? "12px 16px" : "10px 20px",
              backgroundColor: "#000000",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              width: window.innerWidth <= 1024 ? "100%" : "auto",
              fontSize: window.innerWidth <= 480 ? "16px" : window.innerWidth <= 768 ? "14px" : "16px",
              transition: "background-color 0.2s ease",
              fontWeight: "500"
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = "#333333"}
            onMouseLeave={(e) => e.target.style.backgroundColor = "#000000"}
          >
            Gem aktivitet
          </button>
          {saveMessage && (
            <div style={{
              marginTop: "10px",
              padding: "8px 12px",
              backgroundColor: "#10b981",
              color: "white",
              borderRadius: "4px",
              fontSize: window.innerWidth <= 480 ? "14px" : "15px",
              fontWeight: "500",
              textAlign: "center"
            }}>
              {saveMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;