const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const borderIndicator = document.getElementById('border-indicator');

let cursorX = 0;
let cursorY = 0;
let targetX = 0;
let targetY = 0;
let startX = 0;
let startY = 0;
let mouseX = 0;
let mouseY = 0;
let isPointerLocked = false;
let isAnimating = false;
let animationStartTime = 0;
const ANIMATION_DURATION = 300; // ms

// Lens system
let lenses = [];
let draggedLens = null;
let draggedPart = null; // 'src' or 'dst'
let dragOffsetX = 0;
let dragOffsetY = 0;
const LENS_SIZE = 128;
const GRID_COLS = 4;
const GRID_ROWS = 4;
let transformingLens = null; // lens currently being transformed
let transformStartTime = 0;
let transformStartRotation = 0;
let transformTargetRotation = 0;
let transformStartFlipX = 1;
let transformTargetFlipX = 1;
let transformStartFlipY = 1;
let transformTargetFlipY = 1;
const TRANSFORM_DURATION = 300; // ms
let dragDirection = null; // 'horizontal' or 'vertical'
let dragRowOrCol = -1; // which row or column is being dragged
let dragStartPos = { x: 0, y: 0 };
let dragAccumulatedX = 0; // accumulated drag distance X
let dragAccumulatedY = 0; // accumulated drag distance Y
let dragStartPositions = []; // store original positions of dragged lenses
let frozenCursorX = 0; // frozen cursor X position during drag
let frozenCursorY = 0; // frozen cursor Y position during drag
let isSnapping = false; // is currently snapping to grid
let snapStartTime = 0; // when snap animation started
let snapDuration = 200; // snap animation duration in ms
let snapStartPositions = []; // positions at start of snap animation
let snapTargetPositions = []; // target positions for snap animation

// Set canvas size to match window with correct DPI
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Set display size (CSS pixels)
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    // Set actual size in memory (scaled to account for DPI)
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    
    // Scale context to ensure correct drawing operations
    ctx.scale(dpr, dpr);
    
    // Initialize cursor to center (in CSS pixels)
    cursorX = width / 2;
    cursorY = height / 2;
    targetX = cursorX;
    targetY = cursorY;
    
    // Redraw after resize
    draw();
}

// Initialize canvas size
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Create 4x4 grid of lenses
function createLensGrid() {
    lenses = [];
    const width = window.innerWidth;
    const height = window.innerHeight;
    const cols = GRID_COLS;
    const rows = GRID_ROWS;
    
    const spacing = 0;
    const totalWidth = cols * LENS_SIZE + (cols - 1) * spacing;
    const totalHeight = rows * LENS_SIZE + (rows - 1) * spacing;
    
    const startX = (width - totalWidth) / 2;
    const startY = (height - totalHeight) / 2;
    
    // Store grid origin for later calculations
    window.gridStartX = startX;
    window.gridStartY = startY;
    
    // Create src positions
    const srcPositions = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = startX + col * (LENS_SIZE + spacing);
            const y = startY + row * (LENS_SIZE + spacing);
            srcPositions.push({ x, y });
        }
    }
    
    // Create uniformly random derangement in fixed O(n) steps
    const n = srcPositions.length;
    const permutation = Array(n).fill(0).map((_, i) => i);
    
    // Generate uniform random derangement using fixed-step algorithm
    // Based on "Generating Random Derangements" by Martinez et al.
    for (let i = n - 1; i > 0; i--) {
        // Choose random position from 0 to i-1 (never i itself)
        const j = Math.floor(Math.random() * i);
        [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
    }
    
    // Handle the final element - if it's in position 0, swap with position 1
    if (permutation[0] === 0) {
        [permutation[0], permutation[1]] = [permutation[1], permutation[0]];
    }
    
    // Apply permutation to dst positions
    const dstPositions = permutation.map(i => srcPositions[i]);
    
    // Create lenses with shuffled dst and store grid positions
    for (let i = 0; i < srcPositions.length; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        
        // Random rotation: 0, 90, 180, or 270 degrees
        const randomRotation = [0, 90, 180, 270][Math.floor(Math.random() * 4)];
        // Random flip: 50% chance for horizontal flip, 50% for vertical flip
        const randomFlipX = Math.random() < 0.5 ? 1 : -1;
        const randomFlipY = Math.random() < 0.5 ? 1 : -1;
        
        lenses.push({
            src: {
                x: srcPositions[i].x,
                y: srcPositions[i].y,
                size: LENS_SIZE
            },
            dst: {
                x: dstPositions[i].x,
                y: dstPositions[i].y,
                size: LENS_SIZE
            },
            srcGridRow: row,
            srcGridCol: col,
            rotation: randomRotation,
            flipX: randomFlipX,
            flipY: randomFlipY,
            currentRotation: randomRotation, // for animation
            currentFlipX: randomFlipX,
            currentFlipY: randomFlipY
        });
    }
    
    draw();
}

// Initialize lenses
createLensGrid();

// Rotate lens 90 degrees clockwise
function rotateLens(lens) {
    transformingLens = lens;
    transformStartTime = performance.now();
    transformStartRotation = lens.currentRotation;
    transformTargetRotation = (lens.rotation + 90) % 360;
    lens.rotation = transformTargetRotation;
    transformStartFlipX = lens.currentFlipX;
    transformTargetFlipX = lens.flipX;
    transformStartFlipY = lens.currentFlipY;
    transformTargetFlipY = lens.flipY;
    animateTransform();
}

// Flip lens horizontally
function flipLens(lens) {
    transformingLens = lens;
    transformStartTime = performance.now();
    transformStartRotation = lens.currentRotation;
    transformTargetRotation = lens.rotation;
    transformStartFlipX = lens.currentFlipX;
    transformTargetFlipX = -lens.flipX;
    lens.flipX = transformTargetFlipX;
    transformStartFlipY = lens.currentFlipY;
    transformTargetFlipY = lens.flipY;
    animateTransform();
}

// Animate transformation
function animateTransform() {
    const elapsed = performance.now() - transformStartTime;
    const progress = Math.min(elapsed / TRANSFORM_DURATION, 1);
    const eased = easeOutCubic(progress);
    
    if (transformingLens) {
        // Interpolate rotation
        let rotDiff = transformTargetRotation - transformStartRotation;
        // Normalize to shortest rotation path
        if (rotDiff > 180) rotDiff -= 360;
        if (rotDiff < -180) rotDiff += 360;
        transformingLens.currentRotation = transformStartRotation + rotDiff * eased;
        
        // Interpolate flips
        transformingLens.currentFlipX = transformStartFlipX + (transformTargetFlipX - transformStartFlipX) * eased;
        transformingLens.currentFlipY = transformStartFlipY + (transformTargetFlipY - transformStartFlipY) * eased;
    }
    
    draw();
    
    if (progress < 1) {
        requestAnimationFrame(animateTransform);
    } else {
        if (transformingLens) {
            transformingLens.currentRotation = transformTargetRotation;
            transformingLens.currentFlipX = transformTargetFlipX;
            transformingLens.currentFlipY = transformTargetFlipY;
        }
        transformingLens = null;
        draw();
    }
}


// Handle pointer lock change
document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
        isPointerLocked = true;
        borderIndicator.classList.add('locked');
        // Animate from current hover position to saved locked position
        targetX = cursorX;
        targetY = cursorY;
        startAnimation();
        
    } else {
        isPointerLocked = false;
        borderIndicator.classList.remove('locked');
        // Animate from locked position to current mouse position
        targetX = mouseX;
        targetY = mouseY;
        startAnimation();
    }
});

// Handle mouse movement
document.addEventListener('mousemove', (e) => {
    if (isPointerLocked) {
        // Handle lens dragging while pointer locked
        if (draggedLens) {
            // Don't update cursor position while dragging - keep it frozen
            // Just use movements for drag calculations
            dragAccumulatedX += e.movementX;
            dragAccumulatedY += e.movementY;
            
            // Determine direction if not yet set
            if (dragDirection === null) {
                const dx = Math.abs(dragAccumulatedX);
                const dy = Math.abs(dragAccumulatedY);
                
                if (dx > 5 || dy > 5) {
                    if (dx > dy) {
                        dragDirection = 'horizontal';
                        // Find which row this dst is in
                        const gridRow = Math.round((draggedLens.dst.y - window.gridStartY) / LENS_SIZE);
                        dragRowOrCol = gridRow;
                        
                        // Store original positions
                        dragStartPositions = lenses
                            .filter(lens => Math.round((lens.dst.y - window.gridStartY) / LENS_SIZE) === gridRow)
                            .map(lens => ({ lens, x: lens.dst.x, y: lens.dst.y }));
                    } else {
                        dragDirection = 'vertical';
                        // Find which column this dst is in
                        const gridCol = Math.round((draggedLens.dst.x - window.gridStartX) / LENS_SIZE);
                        dragRowOrCol = gridCol;
                        
                        // Store original positions
                        dragStartPositions = lenses
                            .filter(lens => Math.round((lens.dst.x - window.gridStartX) / LENS_SIZE) === gridCol)
                            .map(lens => ({ lens, x: lens.dst.x, y: lens.dst.y }));
                    }
                }
            }
            
            // Apply movement to entire row/column
            if (dragDirection === 'horizontal') {
                slideRow(dragRowOrCol, dragAccumulatedX);
            } else if (dragDirection === 'vertical') {
                slideColumn(dragRowOrCol, dragAccumulatedY);
            }
        } else {
            // Normal cursor movement when not dragging
            targetX += e.movementX;
            targetY += e.movementY;
            
            // Keep target within canvas bounds (CSS pixels)
            const width = window.innerWidth;
            const height = window.innerHeight;
            targetX = Math.max(0, Math.min(width, targetX));
            targetY = Math.max(0, Math.min(height, targetY));
            
            // If not animating, update cursor immediately
            if (!isAnimating) {
                cursorX = targetX;
                cursorY = targetY;
            }
        }
        
        draw();
    } else {
        // Track mouse position when not locked
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        
        // No dragging when not locked - just update cursor
        if (true) {
            // If not animating, update cursor immediately
            if (!isAnimating) {
                cursorX = mouseX;
                cursorY = mouseY;
                draw();
            }
        }
    }
});

// Exit pointer lock on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPointerLocked) {
        document.exitPointerLock();
    }
});

// Handle mouse down for lens dragging or pointer lock
canvas.addEventListener('mousedown', (e) => {
    if (isPointerLocked) {
        // Left click (button 0) = drag, others handled by click/contextmenu
        if (e.button === 0) {
            // Use virtual cursor position when locked
            const clickX = cursorX;
            const clickY = cursorY;
            
            // First check if cursor is inside any src region
            let lensWithCursor = null;
            for (const lens of lenses) {
                if (clickX >= lens.src.x && clickX < lens.src.x + lens.src.size &&
                    clickY >= lens.src.y && clickY < lens.src.y + lens.src.size) {
                    lensWithCursor = lens;
                    break;
                }
            }
            
            if (lensWithCursor) {
                // Start dragging - will determine row/col and direction on movement
                draggedLens = lensWithCursor;
                draggedPart = 'dst';
                dragDirection = null;
                dragRowOrCol = -1;
                dragStartPos = { x: clickX, y: clickY };
                dragAccumulatedX = 0;
                dragAccumulatedY = 0;
                
                // Freeze cursor position
                frozenCursorX = cursorX;
                frozenCursorY = cursorY;
                
                e.preventDefault();
                e.stopPropagation();
            } else {
                // If not in src, check if clicking on a dst directly
                const result = getLensAtPosition(clickX, clickY);
                if (result) {
                    draggedLens = result.lens;
                    draggedPart = result.part;
                    dragDirection = null;
                    dragRowOrCol = -1;
                    dragStartPos = { x: clickX, y: clickY };
                    dragAccumulatedX = 0;
                    dragAccumulatedY = 0;
                    
                    // Freeze cursor position
                    frozenCursorX = cursorX;
                    frozenCursorY = cursorY;
                    
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        }
    } else {
        // Request pointer lock when not locked
        canvas.requestPointerLock();
        e.preventDefault();
    }
}, true);

// Helper: Find dst that shows the src region at cursor position
function getDstShowingSrcAtPosition(x, y) {
    // First, find which src region contains the cursor
    for (const lens of lenses) {
        if (x >= lens.src.x && x < lens.src.x + lens.src.size &&
            y >= lens.src.y && y < lens.src.y + lens.src.size) {
            // Found the src region, now find which dst is showing this src
            // The dst that shows this src is the one whose src matches
            return lens;
        }
    }
    return null;
}

// Handle click for rotation (left click without drag)
canvas.addEventListener('click', (e) => {
    if (isPointerLocked && !dragDirection) {
        const clickX = cursorX;
        const clickY = cursorY;
        
        // Find dst that is showing the src under cursor
        const lens = getDstShowingSrcAtPosition(clickX, clickY);
        if (lens) {
            rotateLens(lens);
            e.preventDefault();
        }
    }
});

// Handle right click for flip
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (isPointerLocked) {
        const clickX = cursorX;
        const clickY = cursorY;
        
        // Find dst that is showing the src under cursor
        const lens = getDstShowingSrcAtPosition(clickX, clickY);
        if (lens) {
            flipLens(lens);
        }
    }
});

// Handle mouse up to stop dragging and snap to grid
document.addEventListener('mouseup', () => {
    if (draggedLens && dragDirection) {
        // Start smooth snap animation to nearest grid position
        let snapTargets;
        if (dragDirection === 'horizontal') {
            snapTargets = calculateSnapRowPositions(dragRowOrCol);
        } else if (dragDirection === 'vertical') {
            snapTargets = calculateSnapColumnPositions(dragRowOrCol);
        }
        
        if (snapTargets && snapTargets.length > 0) {
            startSnapAnimation(snapTargets);
        }
    }
    
    draggedLens = null;
    draggedPart = null;
    dragDirection = null;
    dragRowOrCol = -1;
    dragAccumulatedX = 0;
    dragAccumulatedY = 0;
    dragStartPositions = [];
});

// Ease-out cubic function
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// Start transition animation
function startAnimation() {
    // Save starting position
    startX = cursorX;
    startY = cursorY;
    isAnimating = true;
    animationStartTime = performance.now();
    animate();
}

// Animation loop (only runs during transition)
function animate() {
    const elapsed = performance.now() - animationStartTime;
    const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
    const eased = easeOutCubic(progress);
    
    // Interpolate from start position to target
    cursorX = startX + (targetX - startX) * eased;
    cursorY = startY + (targetY - startY) * eased;
    
    draw();
    
    if (progress < 1) {
        requestAnimationFrame(animate);
    } else {
        isAnimating = false;
        cursorX = targetX;
        cursorY = targetY;
        draw();
    }
}

// Helper: Check if two rectangles overlap
function rectanglesOverlap(r1, r2) {
    return !(r1.x + r1.size < r2.x || 
             r2.x + r2.size < r1.x || 
             r1.y + r1.size < r2.y || 
             r2.y + r2.size < r1.y);
}

// Helper: Check if lens sources overlap with existing lenses
function hasSourceOverlap(newSrc) {
    return lenses.some(lens => rectanglesOverlap(lens.src, newSrc));
}

// Helper: Get lens at position (for clicking/dragging)
function getLensAtPosition(x, y) {
    // Check in reverse order to get topmost lens
    for (let i = lenses.length - 1; i >= 0; i--) {
        const lens = lenses[i];
        
        // Only check dst (src is not draggable)
        if (x >= lens.dst.x && x <= lens.dst.x + lens.dst.size &&
            y >= lens.dst.y && y <= lens.dst.y + lens.dst.size) {
            return { lens, part: 'dst' };
        }
    }
    return null;
}

// Slide a row horizontally with wrapping
function slideRow(row, offset) {
    dragStartPositions.forEach(({ lens, x, y }) => {
        // Apply offset to original position
        const newX = x + offset;
        
        // Normalize to grid width for wrapping
        const relativeX = newX - window.gridStartX;
        const totalWidth = GRID_COLS * LENS_SIZE;
        const wrappedX = ((relativeX % totalWidth) + totalWidth) % totalWidth;
        
        lens.dst.x = window.gridStartX + wrappedX;
    });
}

// Slide a column vertically with wrapping
function slideColumn(col, offset) {
    dragStartPositions.forEach(({ lens, x, y }) => {
        // Apply offset to original position
        const newY = y + offset;
        
        // Normalize to grid height for wrapping
        const relativeY = newY - window.gridStartY;
        const totalHeight = GRID_ROWS * LENS_SIZE;
        const wrappedY = ((relativeY % totalHeight) + totalHeight) % totalHeight;
        
        lens.dst.y = window.gridStartY + wrappedY;
    });
}

// Calculate snap positions for row (considering wrapping)
function calculateSnapRowPositions(row) {
    const totalGridWidth = GRID_COLS * LENS_SIZE;
    const lensesInRow = lenses.filter((lens, idx) => {
        const gridRow = Math.round((lens.dst.y - window.gridStartY) / LENS_SIZE);
        return gridRow === row;
    });
    
    return lensesInRow.map(lens => {
        const gridCol = Math.round((lens.dst.x - window.gridStartX) / LENS_SIZE);
        const wrappedCol = ((gridCol % GRID_COLS) + GRID_COLS) % GRID_COLS;
        const targetX = window.gridStartX + wrappedCol * LENS_SIZE;
        
        // Find shortest path considering wrapping
        const currentX = lens.dst.x;
        const diff = targetX - currentX;
        
        // Check if wrapping the other way is shorter
        let adjustedTargetX = targetX;
        if (Math.abs(diff) > totalGridWidth / 2) {
            if (diff > 0) {
                adjustedTargetX = targetX - totalGridWidth;
            } else {
                adjustedTargetX = targetX + totalGridWidth;
            }
        }
        
        return {
            lens,
            targetX: adjustedTargetX,
            targetY: lens.dst.y,
            finalX: targetX  // store the final wrapped position
        };
    });
}

// Calculate snap positions for column (considering wrapping)
function calculateSnapColumnPositions(col) {
    const totalGridHeight = GRID_ROWS * LENS_SIZE;
    const lensesInCol = lenses.filter((lens, idx) => {
        const gridCol = Math.round((lens.dst.x - window.gridStartX) / LENS_SIZE);
        return gridCol === col;
    });
    
    return lensesInCol.map(lens => {
        const gridRow = Math.round((lens.dst.y - window.gridStartY) / LENS_SIZE);
        const wrappedRow = ((gridRow % GRID_ROWS) + GRID_ROWS) % GRID_ROWS;
        const targetY = window.gridStartY + wrappedRow * LENS_SIZE;
        
        // Find shortest path considering wrapping
        const currentY = lens.dst.y;
        const diff = targetY - currentY;
        
        // Check if wrapping the other way is shorter
        let adjustedTargetY = targetY;
        if (Math.abs(diff) > totalGridHeight / 2) {
            if (diff > 0) {
                adjustedTargetY = targetY - totalGridHeight;
            } else {
                adjustedTargetY = targetY + totalGridHeight;
            }
        }
        
        return {
            lens,
            targetX: lens.dst.x,
            targetY: adjustedTargetY,
            finalY: targetY  // store the final wrapped position
        };
    });
}

// Start smooth snap animation
function startSnapAnimation(targets) {
    snapStartPositions = targets.map(t => ({
        lens: t.lens,
        startX: t.lens.dst.x,
        startY: t.lens.dst.y
    }));
    snapTargetPositions = targets;
    snapStartTime = performance.now();
    isSnapping = true;
    animateSnap();
}

// Animate snap to grid
function animateSnap() {
    const elapsed = performance.now() - snapStartTime;
    const progress = Math.min(elapsed / snapDuration, 1);
    const eased = easeOutCubic(progress);
    
    // Interpolate positions
    for (let i = 0; i < snapTargetPositions.length; i++) {
        const start = snapStartPositions[i];
        const target = snapTargetPositions[i];
        
        target.lens.dst.x = start.startX + (target.targetX - start.startX) * eased;
        target.lens.dst.y = start.startY + (target.targetY - start.startY) * eased;
    }
    
    draw();
    
    if (progress < 1) {
        requestAnimationFrame(animateSnap);
    } else {
        // Ensure final positions are exact (use finalX/finalY if present for wrapping)
        for (const target of snapTargetPositions) {
            target.lens.dst.x = target.finalX !== undefined ? target.finalX : target.targetX;
            target.lens.dst.y = target.finalY !== undefined ? target.finalY : target.targetY;
        }
        isSnapping = false;
        snapStartPositions = [];
        snapTargetPositions = [];
        draw();
    }
}


// Draw cursor crosshair at specific position
function drawCursorAt(x, y) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x + 15, y);
    ctx.stroke();
    
    // Vertical line
    ctx.beginPath();
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x, y + 15);
    ctx.stroke();
    
    // Center circle
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff00';
    ctx.fill();
}

// Main draw function (only called when state changes)
function draw() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Determine cursor position for rendering
    let renderCursorX = cursorX;
    let renderCursorY = cursorY;
    if (draggedLens) {
        // When dragging, use frozen cursor position
        renderCursorX = frozenCursorX;
        renderCursorY = frozenCursorY;
    }
    
    // Draw cursor on main canvas with clipping for src regions
    ctx.save();
    
    // Create clipping path that excludes all src regions
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    for (const lens of lenses) {
        ctx.rect(lens.src.x + lens.src.size, lens.src.y, -lens.src.size, lens.src.size);
    }
    ctx.clip('evenodd');
    
    // Draw cursor (will be clipped to areas outside src regions)
    drawCursorAt(renderCursorX, renderCursorY);
    
    ctx.restore();
    
    // Draw source region borders first (inside the region for perfect alignment)
    const srcBorderWidth = 2;
    for (const lens of lenses) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        
        // Top border
        ctx.fillRect(lens.src.x, lens.src.y, lens.src.size, srcBorderWidth);
        // Bottom border
        ctx.fillRect(lens.src.x, lens.src.y + lens.src.size - srcBorderWidth, lens.src.size, srcBorderWidth);
        // Left border
        ctx.fillRect(lens.src.x, lens.src.y, srcBorderWidth, lens.src.size);
        // Right border
        ctx.fillRect(lens.src.x + lens.src.size - srcBorderWidth, lens.src.y, srcBorderWidth, lens.src.size);
    }
    
    // Helper function to draw a single lens at a specific position
    const drawLensAt = (lens, x, y, renderCursorX, renderCursorY) => {
        // Create a high-DPI temporary canvas for the lens content
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = lens.src.size * dpr;
        tempCanvas.height = lens.src.size * dpr;
        tempCtx.scale(dpr, dpr);
        
        // Fill with background color
        tempCtx.fillStyle = '#1a1a1a';
        tempCtx.fillRect(0, 0, lens.src.size, lens.src.size);
        
        // Check if any part of cursor overlaps with source region
        const cursorSize = 15;
        const cursorLeft = renderCursorX - cursorSize;
        const cursorRight = renderCursorX + cursorSize;
        const cursorTop = renderCursorY - cursorSize;
        const cursorBottom = renderCursorY + cursorSize;
        
        const srcRight = lens.src.x + lens.src.size;
        const srcBottom = lens.src.y + lens.src.size;
        
        // Check if cursor bounding box overlaps with source region
        if (cursorRight >= lens.src.x && cursorLeft < srcRight &&
            cursorBottom >= lens.src.y && cursorTop < srcBottom) {
            
            // Calculate relative position within source
            const relX = renderCursorX - lens.src.x;
            const relY = renderCursorY - lens.src.y;
            
            // Save context and set clipping to source region bounds
            tempCtx.save();
            tempCtx.beginPath();
            tempCtx.rect(0, 0, lens.src.size, lens.src.size);
            tempCtx.clip();
            
            // Draw cursor on temp canvas (will be clipped to source region)
            tempCtx.strokeStyle = '#00ff00';
            tempCtx.lineWidth = 2;
            
            // Horizontal line
            tempCtx.beginPath();
            tempCtx.moveTo(relX - 15, relY);
            tempCtx.lineTo(relX + 15, relY);
            tempCtx.stroke();
            
            // Vertical line
            tempCtx.beginPath();
            tempCtx.moveTo(relX, relY - 15);
            tempCtx.lineTo(relX, relY + 15);
            tempCtx.stroke();
            
            // Center circle
            tempCtx.beginPath();
            tempCtx.arc(relX, relY, 3, 0, Math.PI * 2);
            tempCtx.fillStyle = '#00ff00';
            tempCtx.fill();
            
            tempCtx.restore();
        }
        
        // Apply transformation and draw the temp canvas content to destination
        ctx.save();
        
        // Move to center of destination
        const centerX = x + lens.dst.size / 2;
        const centerY = y + lens.dst.size / 2;
        ctx.translate(centerX, centerY);
        
        // Apply rotation and flip
        ctx.rotate((lens.currentRotation * Math.PI) / 180);
        ctx.scale(lens.currentFlipX, lens.currentFlipY);
        
        // Draw centered
        ctx.drawImage(tempCanvas, -lens.dst.size / 2, -lens.dst.size / 2, lens.dst.size, lens.dst.size);
        
        ctx.restore();
        
        // Draw destination region border on top (inside the region for perfect alignment)
        const borderWidth = 3;
        ctx.fillStyle = '#00ff00';
        
        // Top border
        ctx.fillRect(x, y, lens.dst.size, borderWidth);
        // Bottom border
        ctx.fillRect(x, y + lens.dst.size - borderWidth, lens.dst.size, borderWidth);
        // Left border
        ctx.fillRect(x, y, borderWidth, lens.dst.size);
        // Right border
        ctx.fillRect(x + lens.dst.size - borderWidth, y, borderWidth, lens.dst.size);
    };
    
    // Capture and draw lenses with wrapping support
    const totalGridWidth = GRID_COLS * LENS_SIZE;
    const totalGridHeight = GRID_ROWS * LENS_SIZE;
    
    // Clip rendering to grid boundaries
    ctx.save();
    ctx.beginPath();
    ctx.rect(window.gridStartX, window.gridStartY, totalGridWidth, totalGridHeight);
    ctx.clip();
    
    for (const lens of lenses) {
        drawLensAt(lens, lens.dst.x, lens.dst.y, renderCursorX, renderCursorY);
        
        // Draw wrapped copies if lens extends beyond grid boundaries
        const relX = lens.dst.x - window.gridStartX;
        const relY = lens.dst.y - window.gridStartY;
        
        // Check if wrapping horizontally
        if (relX < 0) {
            drawLensAt(lens, lens.dst.x + totalGridWidth, lens.dst.y, renderCursorX, renderCursorY);
        } else if (relX + lens.dst.size > totalGridWidth) {
            drawLensAt(lens, lens.dst.x - totalGridWidth, lens.dst.y, renderCursorX, renderCursorY);
        }
        
        // Check if wrapping vertically
        if (relY < 0) {
            drawLensAt(lens, lens.dst.x, lens.dst.y + totalGridHeight, renderCursorX, renderCursorY);
        } else if (relY + lens.dst.size > totalGridHeight) {
            drawLensAt(lens, lens.dst.x, lens.dst.y - totalGridHeight, renderCursorX, renderCursorY);
        }
    }
    
    ctx.restore();
    
    // Display coordinates
    ctx.fillStyle = '#00ff00';
    ctx.font = '14px monospace';
    const status = isPointerLocked ? 'LOCKED' : 'HOVER';
    ctx.fillText(`${status} | X: ${Math.round(cursorX)} Y: ${Math.round(cursorY)}`, 10, 20);
}

// Initial draw
draw();

