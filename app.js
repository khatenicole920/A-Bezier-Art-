// app.js
// Initialize canvas and variables
const svg = d3.select("#canvas");
const svgNode = svg.node();
let currentShape = "bezier";
let points = [];
let currentPath = null;
let currentControlLines = null;
let currentControlPoints = null;
let isDragging = false;
let dragPointIndex = -1;
let createdShapes = [];
let gridGroup = null;
let isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Initialize control panel elements
const strokeColorInput = document.getElementById("stroke-color");
const strokePreview = document.getElementById("stroke-preview");
const strokeWidthInput = document.getElementById("stroke-width");
const strokeWidthValue = document.getElementById("stroke-width-value");
const fillColorInput = document.getElementById("fill-color");
const fillPreview = document.getElementById("fill-preview");
const useFillCheckbox = document.getElementById("use-fill");
const showGridCheckbox = document.getElementById("show-grid");
const gridSizeInput = document.getElementById("grid-size");
const gridSizeValue = document.getElementById("grid-size-value");
const snapToGridCheckbox = document.getElementById("snap-to-grid");
const clearButton = document.getElementById("clear-btn");
const undoButton = document.getElementById("undo-btn");
const saveButton = document.getElementById("save-btn");
const shapeButtons = document.querySelectorAll(".shape-button");

// Add event listeners for control panel
strokeColorInput.addEventListener("input", updateStrokeColor);
strokeWidthInput.addEventListener("input", updateStrokeWidth);
fillColorInput.addEventListener("input", updateFillColor);
useFillCheckbox.addEventListener("change", updateFill);
showGridCheckbox.addEventListener("change", toggleGrid);
gridSizeInput.addEventListener("input", updateGridSize);
clearButton.addEventListener("click", clearCanvas);
undoButton.addEventListener("click", undoLastShape);
saveButton.addEventListener("click", saveSVG);

// Shape selection
shapeButtons.forEach(button => {
  button.addEventListener("click", function() {
    shapeButtons.forEach(btn => btn.classList.remove("active"));
    this.classList.add("active");
    currentShape = this.getAttribute("data-shape");
    resetDrawing();
  });
});

// Create grid container
gridGroup = svg.append("g").attr("class", "grid");

// Initialize grid
createGrid();

// Update functions for controls
function updateStrokeColor() {
  strokePreview.style.backgroundColor = strokeColorInput.value;
  if (currentPath) {
    currentPath.attr("stroke", strokeColorInput.value);
  }
}

function updateStrokeWidth() {
  strokeWidthValue.textContent = strokeWidthInput.value;
  if (currentPath) {
    currentPath.attr("stroke-width", strokeWidthInput.value);
  }
}

function updateFillColor() {
  fillPreview.style.backgroundColor = fillColorInput.value;
  updateFill();
}

function updateFill() {
  if (currentPath) {
    currentPath.attr("fill", useFillCheckbox.checked ? fillColorInput.value : "none");
  }
}

function toggleGrid() {
  gridGroup.style("display", showGridCheckbox.checked ? "block" : "none");
}

function updateGridSize() {
  gridSizeValue.textContent = gridSizeInput.value;
  createGrid();
}

function createGrid() {
  gridGroup.selectAll("*").remove();
  
  // Get dimensions from viewBox since we're not using width/height attributes
  const viewBox = svgNode.getAttribute("viewBox").split(" ");
  const width = parseInt(viewBox[2]);
  const height = parseInt(viewBox[3]);
  const gridSize = parseInt(gridSizeInput.value);
  
  // Create vertical grid lines
  for (let x = gridSize; x < width; x += gridSize) {
    gridGroup.append("line")
      .attr("class", "grid-line")
      .attr("x1", x)
      .attr("y1", 0)
      .attr("x2", x)
      .attr("y2", height);
  }
  
  // Create horizontal grid lines
  for (let y = gridSize; y < height; y += gridSize) {
    gridGroup.append("line")
      .attr("class", "grid-line")
      .attr("x1", 0)
      .attr("y1", y)
      .attr("x2", width)
      .attr("y2", y);
  }
  
  // Apply grid visibility setting
  toggleGrid();
}

// Snap coordinates to grid if enabled
function snapToGrid(x, y) {
  if (snapToGridCheckbox.checked) {
    const gridSize = parseInt(gridSizeInput.value);
    x = Math.round(x / gridSize) * gridSize;
    y = Math.round(y / gridSize) * gridSize;
  }
  return { x, y };
}

// Get pointer coordinates from either mouse or touch event
function getPointerCoords(event) {
  // If it's a touch event
  if (event.type.startsWith('touch')) {
    if (event.touches && event.touches.length > 0) {
      const touch = event.touches[0];
      const rect = svgNode.getBoundingClientRect();
      const svgPoint = svgNode.createSVGPoint();
      
      // Calculate the correct coordinates within the SVG's coordinate system
      svgPoint.x = touch.clientX - rect.left;
      svgPoint.y = touch.clientY - rect.top;
      
      // Adjust for SVG's viewBox
      const viewBox = svgNode.getAttribute("viewBox").split(" ");
      const vbWidth = parseInt(viewBox[2]);
      const vbHeight = parseInt(viewBox[3]);
      const scale = {
        x: vbWidth / rect.width,
        y: vbHeight / rect.height
      };
      
      return [svgPoint.x * scale.x, svgPoint.y * scale.y];
    }
    return [0, 0]; // Return default if no touches
  } 
  // For mouse events, use d3.pointer
  return d3.pointer(event);
}

// Handle pointer down (mouse or touch)
function handlePointerDown(event) {
  // Prevent default behavior to avoid scrolling when drawing
  if (event.type.startsWith('touch')) {
    event.preventDefault();
  }
  
  const coords = getPointerCoords(event);
  let x = coords[0];
  let y = coords[1];
  
  const snapped = snapToGrid(x, y);
  x = snapped.x;
  y = snapped.y;
  
  // Check if we're clicking on an existing control point
  if (currentControlPoints) {
    const controlPoints = currentControlPoints.nodes();
    for (let i = 0; i < controlPoints.length; i++) {
      const controlPoint = controlPoints[i];
      const cx = +controlPoint.getAttribute("cx");
      const cy = +controlPoint.getAttribute("cy");
      
      if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) < 10) {
        isDragging = true;
        dragPointIndex = i;
        return;
      }
    }
  }
  
  // Start a new drawing if we're not dragging a control point
  if (points.length === 0) {
    points.push({ x, y });
    
    if (currentShape === "bezier") {
      // For bezier, we need at least 4 points, so we'll duplicate the first point
      points.push({ x: x + 50, y: y - 50 }); // Control point 1
      points.push({ x: x + 100, y: y - 50 }); // Control point 2
      points.push({ x: x + 150, y }); // End point
      
      // Apply snapping to the initial control points if enabled
      if (snapToGridCheckbox.checked) {
        for (let i = 1; i < points.length; i++) {
          const snapped = snapToGrid(points[i].x, points[i].y);
          points[i].x = snapped.x;
          points[i].y = snapped.y;
        }
      }
      
      // Draw bezier curve
      drawBezierCurve();
    } else if (currentShape === "line") {
      points.push({ x, y }); // End point is same as start initially
      drawLine();
    } else if (currentShape === "rectangle" || currentShape === "circle") {
      points.push({ x, y }); // Second point is same as start initially
      if (currentShape === "rectangle") {
        drawRectangle();
      } else {
        drawCircle();
      }
    }
    
    isDragging = true;
    dragPointIndex = points.length - 1; // Drag the last point
  }
}

// Handle pointer move (mouse or touch)
function handlePointerMove(event) {
  // Prevent default behavior to avoid scrolling when drawing
  if (event.type.startsWith('touch')) {
    event.preventDefault();
  }
  
  if (!isDragging) return;
  
  const coords = getPointerCoords(event);
  let x = coords[0];
  let y = coords[1];
  
  const snapped = snapToGrid(x, y);
  x = snapped.x;
  y = snapped.y;
  
  points[dragPointIndex] = { x, y };
  
  if (currentShape === "bezier") {
    drawBezierCurve();
  } else if (currentShape === "line") {
    drawLine();
  } else if (currentShape === "rectangle") {
    drawRectangle();
  } else if (currentShape === "circle") {
    drawCircle();
  }
}

// Handle pointer up (mouse or touch)
function handlePointerUp(event) {
  // Prevent default behavior
  if (event.type.startsWith('touch')) {
    event.preventDefault();
  }
  
  if (isDragging) {
    isDragging = false;
    
    if (currentShape !== "bezier") {
      // For non-bezier shapes, we're done after pointer up
      finalizeShape();
    }
  }
}

// Drawing functions
function drawBezierCurve() {
  // Remove existing temporary elements
  if (currentPath) currentPath.remove();
  if (currentControlLines) currentControlLines.remove();
  if (currentControlPoints) currentControlPoints.remove();
  
  // Create Bezier curve
  currentPath = svg.append("path")
    .attr("d", getBezierPathData())
    .attr("stroke", strokeColorInput.value)
    .attr("stroke-width", strokeWidthInput.value)
    .attr("fill", useFillCheckbox.checked ? fillColorInput.value : "none")
    .attr("class", "bezier-curve bezier-shape");
  
  // Draw control lines
  currentControlLines = svg.append("g")
    .attr("class", "control-lines")
    .selectAll("line")
    .data([
      { x1: points[0].x, y1: points[0].y, x2: points[1].x, y2: points[1].y },
      { x1: points[2].x, y1: points[2].y, x2: points[3].x, y2: points[3].y }
    ])
    .enter()
    .append("line")
    .attr("x1", d => d.x1)
    .attr("y1", d => d.y1)
    .attr("x2", d => d.x2)
    .attr("y2", d => d.y2)
    .attr("class", "control-line");
  
  // Draw control points
  currentControlPoints = svg.append("g")
    .attr("class", "control-points")
    .selectAll("circle")
    .data(points)
    .enter()
    .append("circle")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", 8)
    .attr("class", "control-point")
    .attr("fill", (d, i) => i === 0 || i === 3 ? "#ff7f0e" : "#1f77b4");
}

function getBezierPathData() {
  return `M${points[0].x},${points[0].y} C${points[1].x},${points[1].y} ${points[2].x},${points[2].y} ${points[3].x},${points[3].y}`;
}

function drawLine() {
  if (currentPath) currentPath.remove();
  
  currentPath = svg.append("line")
    .attr("x1", points[0].x)
    .attr("y1", points[0].y)
    .attr("x2", points[1].x)
    .attr("y2", points[1].y)
    .attr("stroke", strokeColorInput.value)
    .attr("stroke-width", strokeWidthInput.value)
    .attr("class", "line-shape");
}

function drawRectangle() {
  if (currentPath) currentPath.remove();
  
  const x = Math.min(points[0].x, points[1].x);
  const y = Math.min(points[0].y, points[1].y);
  const width = Math.abs(points[1].x - points[0].x);
  const height = Math.abs(points[1].y - points[0].y);
  
  currentPath = svg.append("rect")
    .attr("x", x)
    .attr("y", y)
    .attr("width", width)
    .attr("height", height)
    .attr("stroke", strokeColorInput.value)
    .attr("stroke-width", strokeWidthInput.value)
    .attr("fill", useFillCheckbox.checked ? fillColorInput.value : "none")
    .attr("class", "rectangle-shape");
}

function drawCircle() {
  if (currentPath) currentPath.remove();
  
  const dx = points[1].x - points[0].x;
  const dy = points[1].y - points[0].y;
  const radius = Math.sqrt(dx * dx + dy * dy);
  
  currentPath = svg.append("circle")
    .attr("cx", points[0].x)
    .attr("cy", points[0].y)
    .attr("r", radius)
    .attr("stroke", strokeColorInput.value)
    .attr("stroke-width", strokeWidthInput.value)
    .attr("fill", useFillCheckbox.checked ? fillColorInput.value : "none")
    .attr("class", "circle-shape");
}

function finalizeShape() {
  if (currentPath) {
    // Create a clone of the current path
    const finalShapeNode = currentPath.node().cloneNode(true);
    
    // Add the shape to the canvas
    svg.node().appendChild(finalShapeNode);
    
    // Store the SVG element and its properties
    createdShapes.push({
      element: finalShapeNode,
      type: currentShape,
      points: [...points] // Copy the points array
    });
    
    // Reset for next shape
    resetDrawing();
  }
}

function resetDrawing() {
  points = [];
  if (currentPath) currentPath.remove();
  if (currentControlLines) currentControlLines.remove();
  if (currentControlPoints) currentControlPoints.remove();
  currentPath = null;
  currentControlLines = null;
  currentControlPoints = null;
}

function clearCanvas() {
  // Remove all shapes but keep the grid
  svg.selectAll(".bezier-shape, .line-shape, .rectangle-shape, .circle-shape, .control-lines, .control-points").remove();
  createdShapes = [];
  resetDrawing();
}

function undoLastShape() {
  if (createdShapes.length > 0) {
    const lastShape = createdShapes.pop();
    svg.node().removeChild(lastShape.element);
  }
  resetDrawing();
}

function saveSVG() {
  // Create a clone of the SVG excluding control points and lines
  const svgClone = svgNode.cloneNode(true);
  
  // Remove control points and lines, and grid from the clone
  const controlElements = svgClone.querySelectorAll(".control-points, .control-lines, .grid");
  controlElements.forEach(el => el.remove());
  
  // Create a blob with the SVG content
  const svgData = new XMLSerializer().serializeToString(svgClone);
  const blob = new Blob([svgData], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  
  // Create a download link and trigger the download
  const link = document.createElement("a");
  link.href = url;
  link.download = "bezier_drawing.svg";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Register both mouse and touch events
function setupEventListeners() {
  // Mouse events
  svg.on("mousedown", handlePointerDown)
     .on("mousemove", handlePointerMove)
     .on("mouseup", handlePointerUp)
     .on("mouseleave", handlePointerUp);
  
  // Touch events
  svg.on("touchstart", handlePointerDown)
     .on("touchmove", handlePointerMove)
     .on("touchend", handlePointerUp)
     .on("touchcancel", handlePointerUp);
  
  // Double-click and double-tap for finalizing bezier
  if (isTouchDevice) {
    // For touch devices, we use touchend with a timer
    let lastTap = 0;
    svg.on("touchend", function(event) {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      
      if (tapLength < 500 && tapLength > 0) {
        // Double tap detected
        if (currentShape === "bezier" && points.length === 4) {
          finalizeShape();
        }
        event.preventDefault();
      }
      lastTap = currentTime;
    });
  } else {
    // For mouse devices, dblclick works fine
    svg.on("dblclick", function() {
      if (currentShape === "bezier" && points.length === 4) {
        finalizeShape();
      }
    });
  }
}

// Add keyboard shortcuts
document.addEventListener("keydown", function(event) {
  // Ctrl+Z or Cmd+Z for undo
  if ((event.ctrlKey || event.metaKey) && event.key === "z") {
    event.preventDefault();
    undoLastShape();
  }
  
  // Delete or Backspace to clear canvas
  if (event.key === "Delete" || event.key === "Backspace") {
    // Only clear if not in an input field
    if (document.activeElement.tagName !== "INPUT") {
      event.preventDefault();
      clearCanvas();
    }
  }
  
  // Escape key to cancel current drawing
  if (event.key === "Escape") {
    resetDrawing();
  }
});

// Add CSS styles specific to touch devices
if (isTouchDevice) {
  // Increase control point size for easier touch
  const style = document.createElement('style');
  style.textContent = `
    .control-point {
      r: 12 !important; /* Larger radius for touch */
    }
    
    /* Prevent iOS overscroll/bounce effect */
    html, body {
      position: fixed;
      overflow: hidden;
      width: 100%;
      height: 100%;
    }
  `;
  document.head.appendChild(style);
}

// Setup all event listeners
setupEventListeners();

// Make sure control inputs update their display values on load
updateStrokeWidth();
updateGridSize();